// Lua scripts give us server-side atomicity for the pending store. Redis runs a
// script to completion without interleaving other commands, so each is a single
// atomic step — which is exactly the `claim` contract: two concurrent callers can
// never receive the same row.

/**
 * Atomically claim up to `limit` oldest pending rows.
 *
 * KEYS: [pending zset, claimed zset, enqueued-ms hash]
 * ARGV: [limit, claimedMs, cutoffMs, rowClaimPrefix, claimId]
 *
 * First reclaims any claim older than `cutoffMs` (crash recovery) back into
 * pending, then `ZPOPMIN`s the oldest rows into the claimed set. Returns the
 * claimed row ids.
 */
export const CLAIM_SCRIPT = `
local pendingKey = KEYS[1]
local claimedKey = KEYS[2]
local enqKey = KEYS[3]
local limit = tonumber(ARGV[1])
local claimedMs = ARGV[2]
local cutoffMs = ARGV[3]
local rowClaimPrefix = ARGV[4]
local claimId = ARGV[5]

local expired = redis.call('ZRANGEBYSCORE', claimedKey, '-inf', '(' .. cutoffMs)
for i = 1, #expired do
  local id = expired[i]
  local score = redis.call('HGET', enqKey, id)
  if score then
    redis.call('ZADD', pendingKey, score, id)
  end
  redis.call('ZREM', claimedKey, id)
  redis.call('DEL', rowClaimPrefix .. id)
end

local popped = redis.call('ZPOPMIN', pendingKey, limit)
local ids = {}
for i = 1, #popped, 2 do
  local id = popped[i]
  ids[#ids + 1] = id
  redis.call('ZADD', claimedKey, claimedMs, id)
  redis.call('SET', rowClaimPrefix .. id, claimId)
end
return ids
`;

/**
 * Permanently remove a claim's rows (after submit + handoff succeed).
 *
 * KEYS: [claimed zset, enqueued-ms hash]
 * ARGV: [claimId, rowPrefix, rowClaimPrefix, ...ids]
 *
 * Each row is removed only if still owned by `claimId`, so a row reclaimed by a
 * later flush (after a TTL expiry) is left untouched.
 */
export const RESOLVE_SCRIPT = `
local claimedKey = KEYS[1]
local enqKey = KEYS[2]
local claimId = ARGV[1]
local rowPrefix = ARGV[2]
local rowClaimPrefix = ARGV[3]
for i = 4, #ARGV do
  local id = ARGV[i]
  if redis.call('GET', rowClaimPrefix .. id) == claimId then
    redis.call('ZREM', claimedKey, id)
    redis.call('DEL', rowPrefix .. id)
    redis.call('DEL', rowClaimPrefix .. id)
    redis.call('HDEL', enqKey, id)
  end
end
return 1
`;

/**
 * Return a failed claim's rows to pending so the next flush retries them.
 *
 * KEYS: [pending zset, claimed zset]
 * ARGV: [claimId, rowClaimPrefix, ...(id, enqueuedMs) pairs]
 *
 * Re-adds each still-owned row to pending at its original `enqueuedMs` score, so
 * ordering is preserved.
 */
export const RELEASE_SCRIPT = `
local pendingKey = KEYS[1]
local claimedKey = KEYS[2]
local claimId = ARGV[1]
local rowClaimPrefix = ARGV[2]
for i = 3, #ARGV, 2 do
  local id = ARGV[i]
  local enq = ARGV[i + 1]
  if redis.call('GET', rowClaimPrefix .. id) == claimId then
    redis.call('ZADD', pendingKey, enq, id)
    redis.call('ZREM', claimedKey, id)
    redis.call('DEL', rowClaimPrefix .. id)
  end
end
return 1
`;
