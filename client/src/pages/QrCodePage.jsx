import { Link, useParams } from "react-router-dom";

export default function QrCodePage() {
  const { hash } = useParams();
  const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
  const qrUrl = hash ? `${apiBaseUrl}/api/qr/${hash}` : "";

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        to="/my-workshops"
        className="text-blue-600 hover:text-blue-800 mb-6 inline-block"
      >
        ← Quay lại Workshop của tôi
      </Link>

      <div className="bg-white rounded-lg shadow p-6 text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">QR check-in</h1>
        {qrUrl ? (
          <img src={qrUrl} alt="QR check-in" className="mx-auto w-64 h-64" />
        ) : (
          <div className="text-gray-500">Không có QR để hiển thị.</div>
        )}
      </div>
    </div>
  );
}
