import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #1a4a20 0%, #0d1f10 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1.5px solid rgba(86,164,91,0.50)",
        }}
      >
        {/* Simplified cheetah mark */}
        <div
          style={{
            width: 18,
            height: 14,
            background: "#e8960a",
            borderRadius: "50% 50% 45% 45%",
            position: "relative",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
