import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { registrationService } from "../services";
import { formatDate, formatPrice } from "../utils/helpers";

const PAGE_SIZE = 6;

function buildRoomMapLink(roomMapUrl) {
  const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
  if (!roomMapUrl) {
    return "";
  }
  return roomMapUrl.startsWith("/") ? `${apiBaseUrl}${roomMapUrl}` : roomMapUrl;
}

export default function MyWorkshopsPage() {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;

  const fetchRegistrations = async (targetPage) => {
    try {
      setLoading(true);
      const data = await registrationService.getMyRegistrations({
        page: targetPage,
        pageSize: PAGE_SIZE,
      });
      setItems(data?.items ?? []);
      setTotalPages(data?.total_pages ?? 1);
      setError(null);
    } catch (err) {
      setError("Lỗi khi tải danh sách đăng ký");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistrations(page);
  }, [page]);

  const pageLabel = useMemo(
    () => `${page} / ${totalPages}`,
    [page, totalPages],
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Workshop của tôi</h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={!canGoPrev}
            className="px-3 py-2 text-sm rounded border border-gray-200 text-gray-700 disabled:opacity-40"
          >
            Trước
          </button>
          <span className="text-sm text-gray-600">Trang {pageLabel}</span>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={!canGoNext}
            className="px-3 py-2 text-sm rounded border border-gray-200 text-gray-700 disabled:opacity-40"
          >
            Sau
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          Bạn chưa đăng ký workshop nào.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const workshop = item.workshop || {};
            const isPaid = Boolean(workshop.is_paid);
            const paymentStatus = item.payment_status || "PENDING";
            const roomMapLink = buildRoomMapLink(workshop.room_map_url);
            const qrAvailable = !isPaid || paymentStatus === "PAID";

            const paymentLabel = !isPaid
              ? "Miễn phí"
              : paymentStatus === "PAID"
                ? "Đã thanh toán"
                : "Chưa thanh toán";

            return (
              <div
                key={item.id}
                className="bg-white rounded-lg shadow-sm border border-gray-100 p-5"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-gray-800">
                      {workshop.title || "Workshop"}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Diễn giả: {workshop.speaker_name || "Chưa cập nhật"}
                    </p>
                    <p className="text-sm text-gray-600">
                      Thời gian: {formatDate(workshop.start_time)} -{" "}
                      {formatDate(workshop.end_time)}
                    </p>
                    <p className="text-sm text-gray-600">
                      Trạng thái thanh toán: {paymentLabel}
                      {isPaid && paymentStatus !== "PAID" && (
                        <span className="text-xs text-gray-500">
                          {" "}
                          (Giá: {formatPrice(workshop.price)})
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {isPaid && paymentStatus !== "PAID" ? (
                      <Link
                        to={`/workshops/${workshop.id}/payment`}
                        className="px-4 py-2 text-sm rounded bg-blue-600 text-white text-center hover:bg-blue-700"
                      >
                        Thanh toán
                      </Link>
                    ) : (
                      <span className="px-4 py-2 text-sm rounded bg-gray-100 text-gray-400 text-center cursor-not-allowed">
                        {isPaid ? "Đã thanh toán" : "Miễn phí"}
                      </span>
                    )}
                    <Link
                      to={`/workshops/${workshop.id}/room-map`}
                      className={`px-4 py-2 text-sm rounded text-center ${
                        roomMapLink
                          ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          : "bg-gray-50 text-gray-400 pointer-events-none"
                      }`}
                    >
                      {roomMapLink ? "Xem sơ đồ" : "Chưa cập nhật"}
                    </Link>
                    <Link
                      to={`/my-workshops/qr/${item.qr_code_hash || ""}`}
                      className={`px-4 py-2 text-sm rounded text-center ${
                        qrAvailable && item.qr_code_hash
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "bg-gray-50 text-gray-400 pointer-events-none"
                      }`}
                    >
                      {qrAvailable ? "Xem QR" : "Chưa thanh toán"}
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
