import type { SVGProps } from "react";

// Full-color provider tiles (96×96) ported from apps/web/components/logos.tsx.
// Gradient / clip ids are namespaced per logo so multiple inlined SVGs don't
// collide. Round the corners via CSS (borderRadius on the wrapper / style).

export const OpenAI = (props: SVGProps<SVGSVGElement>) => (
  <svg
    fill="none"
    viewBox="0 0 96 96"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>OpenAI</title>
    <path d="m0 0h96v96h-96z" fill="#10a37f" />
    <g fill="#fff" transform="translate(22 22) scale(2.1667)">
      <path d="M22.28 9.82a5.98 5.98 0 0 0-0.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 0.74 7.1 5.98 5.98 0 0 0 0.51 4.91 6.05 6.05 0 0 0 6.51 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-0.75-7.07zm-9.02 12.61a4.48 4.48 0 0 1-2.88-1.04l0.14-0.08 4.78-2.76a0.790.79 0 0 0 0.39-0.68v-6.74l2.02 1.17a0.070.07 0 0 1 0.040.05v5.58a4.5 4.5 0 0 1-4.49 4.49zm-9.66-4.13a4.47 4.47 0 0 1-0.53-3.01l0.140.09 4.78 2.76a0.770.77 0 0 0 0.78 0l5.84-3.37v2.33a0.080.08 0 0 1-0.030.06L9.74 19.95a4.5 4.5 0 0 1-6.14-1.65zM2.34 7.9a4.49 4.49 0 0 1 2.37-1.97V11.6a0.770.77 0 0 0 0.390.68l5.81 3.35-2.02 1.17a0.080.08 0 0 1-0.07 0l-4.83-2.79A4.5 4.5 0 0 1 2.34 7.87zm16.6 3.86L13.1 8.36 15.12 7.2a0.080.08 0 0 1 0.07 0l4.83 2.79a4.49 4.49 0 0 1-0.68 8.1v-5.68a.79.79 0 0 0-0.41-0.67zm2.01-3.02l-0.14-0.09-4.77-2.78a0.780.78 0 0 0-0.79 0L9.41 9.23V6.9a0.070.07 0 0 1 0.03-0.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66zM8.31 12.86l-2.02-1.16a0.080.08 0 0 1-0.04-0.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-0.140.08L8.7 5.46a0.790.79 0 0 0-0.390.68zm1.1-2.37l2.6-1.5 2.61 1.5v3l-2.6 1.5-2.61-1.5Z" />
    </g>
  </svg>
);

export const Anthropic = (props: SVGProps<SVGSVGElement>) => (
  <svg
    fill="none"
    viewBox="0 0 96 96"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Anthropic</title>
    <path d="m0 0h96v96h-96z" fill="#d77655" />
    <path
      d="m30.98 57.24 11.01-6.180.19-0.54-0.19-0.3-0.540-1.84-0.11-6.29-0.17-5.46-0.23-5.29-0.28-1.33-0.28-1.25-1.640.13-.82 1.12-0.75 1.60.14 3.540.24 5.310.37 3.850.23 5.710.59h0.91l0.13-0.37-0.31-0.23-0.24-0.23-5.5-3.73-5.95-3.94-3.12-2.27-1.69-1.15-0.85-1.08-0.37-2.35 1.53-1.69 2.060.140.530.14 2.08 1.6 4.45 3.44 5.81 4.280.850.710.34-0.240.04-0.17-0.38-0.64-3.16-5.71-3.37-5.81-1.5-2.41-0.4-1.44c-0.14-0.59-0.24-1.09-0.24-1.7l1.74-2.370.96-.31 2.32.31.980.85 1.44 3.3 2.34 5.2 3.63 7.07 1.06 2.10.57 1.940.210.590.370v-0.34l0.3-3.980.55-4.890.54-6.290.19-1.770.88-2.12 1.74-1.15 1.360.65 1.12 1.6-0.15 1.04-0.67 4.32-1.3 6.77-0.85 4.54h0.5l0.57-0.57 2.29-3.05 3.85-4.82 1.7-1.91 1.98-2.11 1.27-1.01 2.410 1.77 2.63-0.79 2.72-2.48 3.14-2.06 2.66-2.95 3.97-1.84 3.170.170.250.44-0.04 6.66-1.42 3.6-.65 4.29-0.74 1.940.910.210.92-0.76 1.89-4.59 1.13-5.39 1.08-8.02 1.9-0.10.070.110.14 3.610.34 1.550.08h3.78l7.040.53 1.84 1.22 1.1 1.49-0.19 1.13-2.83 1.44-3.82-0.91-8.93-2.12-3.06-0.76-0.420v0.25l2.55 2.49 4.67 4.22 5.85 5.440.3 1.35-0.75 1.06-0.79-0.11-5.14-3.87-1.98-1.74-4.49-3.78-0.30v0.4l1.04 1.52 5.47 8.220.28 2.52-0.40.82-1.420.5-1.56-0.28-3.2-4.49-3.3-5.06-2.66-4.54-0.320.19-1.57 16.93-0.740.87-1.70.65-1.42-1.08-0.75-1.740.75-3.440.91-4.490.74-3.570.67-4.440.4-1.47-0.03-0.1-0.320.04-3.34 4.59-5.09 6.87-4.02 4.31-0.960.38-1.67-0.870.16-1.550.93-1.38 5.57-7.09 3.36-4.39 2.17-2.54-0.02-0.37h-0.13l-14.8 9.61-2.630.34-1.13-1.06.14-1.740.54-0.57 4.45-3.06-0.020.02z"
      fill="#fcf2ee"
    />
  </svg>
);

export const Gemini = (props: SVGProps<SVGSVGElement>) => (
  <svg
    fill="none"
    viewBox="0 0 96 96"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Google Gemini</title>
    <radialGradient
      cx="0"
      cy="0"
      gradientTransform="matrix(96.79554782 32.73185485 -262.20272286 775.39315499 9.528 39.018)"
      gradientUnits="userSpaceOnUse"
      id="gemini-a"
      r="1"
    >
      <stop offset=".067" stopColor="#9168c0" />
      <stop offset=".343" stopColor="#5684d1" />
      <stop offset=".672" stopColor="#1ba1e3" />
    </radialGradient>
    <clipPath id="gemini-b">
      <path d="m20 20h56v56h-56z" />
    </clipPath>
    <path d="m0 0h96v96h-96z" fill="url(#gemini-a)" />
    <g clipPath="url(#gemini-b)">
      <path
        d="m76 48.06c-7.270.45-14.12 3.53-19.26 8.68s-8.23 12-8.68 19.26h-0.11c-0.45-7.27-3.53-14.12-8.68-19.26s-12-8.23-19.26-8.68v-0.11c7.27-0.45 14.12-3.53 19.26-8.68s8.23-12 8.68-19.26h0.11c0.45 7.27 3.53 14.12 8.68 19.26s12 8.23 19.26 8.68z"
        fill="#fff"
      />
    </g>
  </svg>
);

export const Mistral = (props: SVGProps<SVGSVGElement>) => (
  <svg
    fill="none"
    viewBox="0 0 96 96"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Mistral AI</title>
    <clipPath id="mistral-a">
      <path d="m0 0h96v96h-96z" />
    </clipPath>
    <g clipPath="url(#mistral-a)">
      <path d="m96 0h-96v19.2h96z" fill="#ffd800" />
      <path d="m96 19.2h-96v19.2h96z" fill="#ffaf00" />
      <path d="m96 38.4h-96v19.2h96z" fill="#ff8205" />
      <path d="m96 57.6h-96v19.2h96z" fill="#fa500f" />
      <path d="m96 76.8h-96v19.2h96z" fill="#e10500" />
      <g fill="#fff">
        <path d="m37.07 59.06h7.54v7.52h-22.61v-7.52h7.53v-7.51h7.54z" />
        <path d="m52.15 59.06h7.53v-7.51h7.54v7.51h7.54v7.52h-22.61v-7.51h-7.54v-7.52h7.54z" />
        <path d="m44.61 44.03h7.54v-7.51h15.08v7.52h0v7.51l-37.690v-15.03h15.08z" />
        <path d="m37.07 36.52-7.540v-7.52h7.54z" />
        <path d="m67.23 36.52h-7.54v-7.52h7.54z" />
      </g>
    </g>
  </svg>
);

export const Together = (props: SVGProps<SVGSVGElement>) => (
  <svg
    fill="none"
    viewBox="0 0 96 96"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Together AI</title>
    <g clipPath="url(#together-clip0)">
      <path d="M0 0H96V96H0V0Z" fill="#EEEEEE" />
      <g clipPath="url(#together-clip1)">
        <path
          d="M72.26 31.76C71.41 30.28 70.27 28.98 68.92 27.94C67.56 26.9 66.01 26.14 64.37 25.7C62.72 25.26 61 25.14 59.3 25.37C57.61 25.59 55.98 26.14 54.5 27C52.6 28.09 51.01 29.64 49.88 31.51C48.74 33.38 48.1 35.5 48.01 37.69L61 37.7V38.82H48.01C48.1 40.85 48.66 42.87 49.74 44.76C50.58 46.27 51.71 47.6 53.07 48.67C54.42 49.74 55.98 50.53 57.64 50.99C59.3 51.45 61.04 51.58 62.76 51.36C64.47 51.14 66.12 50.58 67.62 49.72C69.12 48.86 70.42 47.7 71.47 46.33C72.51 44.95 73.27 43.38 73.71 41.71C74.14 40.04 74.23 38.3 73.98 36.59C73.73 34.88 73.15 33.24 72.26 31.76H72.26Z"
          fill="#EF2CC1"
        />
        <path
          d="M23.74 31.75C22.89 33.23 22.34 34.86 22.11 36.55C21.89 38.25 22 39.97 22.44 41.62C22.89 43.26 23.65 44.81 24.69 46.17C25.73 47.52 27.02 48.66 28.5 49.51C30.39 50.61 32.53 51.21 34.72 51.26C36.9 51.31 39.06 50.8 41 49.79L34.52 38.53L35.49 37.97L41.98 49.22C43.64 48.16 45.04 46.74 46.07 45.06C47.11 43.38 47.74 41.49 47.94 39.53C48.13 37.57 47.88 35.59 47.19 33.74C46.51 31.89 45.41 30.23 43.99 28.86C42.57 27.5 40.85 26.48 38.98 25.88C37.1 25.27 35.11 25.1 33.16 25.38C31.21 25.66 29.35 26.38 27.72 27.48C26.09 28.58 24.73 30.04 23.74 31.75Z"
          fill="#CAAEF5"
        />
        <path
          d="M48 73.77C51.45 73.77 54.75 72.4 57.19 69.96C59.63 67.52 61 64.22 61 60.77C61 56.16 58.61 52.11 54.99 49.81L48.47 61.05L47.51 60.49L54.01 49.24C52.26 48.33 50.33 47.83 48.36 47.78C46.39 47.72 44.43 48.12 42.64 48.93C40.84 49.74 39.26 50.95 38 52.47C36.74 53.98 35.84 55.76 35.37 57.68C34.9 59.59 34.88 61.59 35.29 63.51C35.71 65.44 36.56 67.25 37.77 68.8C38.99 70.35 40.54 71.6 42.31 72.46C44.09 73.32 46.03 73.77 48 73.77Z"
          fill="#FC4C02"
        />
      </g>
    </g>
    <defs>
      <clipPath id="together-clip0">
        <rect width="96" height="96" fill="white" />
      </clipPath>
      <clipPath id="together-clip1">
        <rect
          width="52"
          height="52"
          fill="white"
          transform="translate(22 22)"
        />
      </clipPath>
    </defs>
  </svg>
);

export const Xai = (props: SVGProps<SVGSVGElement>) => (
  <svg
    fill="none"
    viewBox="0 0 96 96"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>xAI</title>
    <g clipPath="url(#xai-clip0)">
      <path d="M0 0H96V96H0V0Z" fill="black" />
      <g clipPath="url(#xai-clip1)">
        <path d="M24.01 40.38L47.55 74H58.02L34.47 40.38H24.01Z" fill="white" />
        <path d="M24 74H34.47L39.7 66.53L34.47 59.05L24 74Z" fill="white" />
        <path
          d="M70.88 22H60.41L42.32 47.84L47.55 55.31L70.88 22Z"
          fill="white"
        />
        <path d="M62.3 74H70.88V25.74L62.3 37.99V74Z" fill="white" />
      </g>
    </g>
    <defs>
      <clipPath id="xai-clip0">
        <rect width="96" height="96" fill="white" />
      </clipPath>
      <clipPath id="xai-clip1">
        <rect
          width="46.8808"
          height="52"
          fill="white"
          transform="translate(24 22)"
        />
      </clipPath>
    </defs>
  </svg>
);

export const Groq = (props: SVGProps<SVGSVGElement>) => (
  <svg
    fill="none"
    viewBox="0 0 96 96"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Groq</title>
    <g clipPath="url(#groq-clip0)">
      <path d="M0 0H96V96H0V0Z" fill="#F55036" />
      <path
        clipRule="evenodd"
        d="M48.09 23.63C38.7 23.54 31.03 30.94 30.94 40.15C30.85 49.37 38.38 56.9 47.78 56.99H53.67V50.74H48.09C42.22 50.8 37.41 46.19 37.34 40.42C37.27 34.67 41.98 29.95 47.84 29.88H48.09C53.95 29.88 58.71 34.55 58.73 40.31V55.68C58.73 61.38 53.99 66.03 48.19 66.11C45.42 66.09 42.77 64.99 40.8 63.05L36.29 67.49C39.43 70.58 43.66 72.33 48.07 72.37H48.3C57.56 72.24 65.01 64.86 65.06 55.76V39.92C64.84 30.85 57.3 23.63 48.09 23.63Z"
        fill="white"
        fillRule="evenodd"
      />
    </g>
    <defs>
      <clipPath id="groq-clip0">
        <rect width="96" height="96" fill="white" />
      </clipPath>
    </defs>
  </svg>
);

export const PROVIDERS = [
  { Icon: OpenAI, name: "OpenAI" },
  { Icon: Anthropic, name: "Anthropic" },
  { Icon: Gemini, name: "Google Gemini" },
  { Icon: Mistral, name: "Mistral AI" },
  { Icon: Xai, name: "xAI" },
  { Icon: Groq, name: "Groq" },
  { Icon: Together, name: "Together AI" },
] as const;
