import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { registrationService } from "../services";
import { formatPrice } from "../utils/helpers";

export default function PaymentPage() {
  const { workshopId } = useParams();
  const navigate = useNavigate();

  const [registration, setRegistration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    initRegistration();
  }, [workshopId]);

  const handleRegistrationLoaded = (data) => {
    setRegistration(data);

    if (data.payment_status === "PAID") {
      setSuccess(true);
      setTimeout(() => {
        navigate("/workshops");
      }, 3000);
    }
  };

  const initRegistration = async () => {
    try {
      setLoading(true);
      const result = await registrationService.register(workshopId);

      if (!result?.registration_id) {
        throw new Error("Không thể tạo đăng ký");
      }

      const data = await registrationService.getRegistration(
        result.registration_id,
      );
      handleRegistrationLoaded(data);
      setError(null);
    } catch (err) {
      if (err.response?.status === 409) {
        try {
          const existing =
            await registrationService.getRegistrationByWorkshop(workshopId);
          handleRegistrationLoaded(existing);
          setError(null);
          return;
        } catch (fallbackError) {
          setError(
            fallbackError.response?.data?.message || "Lỗi khi tải đơn đăng ký",
          );
          console.error(fallbackError);
        }
      } else {
        setError(err.response?.data?.message || "Lỗi khi tạo đăng ký");
        console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      await registrationService.confirmPayment(registration.id);
      setSuccess(true);
      setTimeout(() => {
        navigate("/workshops");
      }, 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Lỗi khi xác nhận thanh toán");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!registration) {
    return (
      <div className="text-center text-red-600">Không thể tạo đơn đăng ký</div>
    );
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto text-center">
        <div className="bg-green-50 border border-green-200 rounded-lg p-8">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-green-600 mb-2">
            Thanh toán thành công!
          </h1>
          <p className="text-gray-600 mb-4">
            Cảm ơn bạn đã đăng ký. Chuyển hướng...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Thanh toán</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <div className="space-y-3 text-gray-600">
          <div>
            <p className="text-sm font-semibold text-gray-700">Workshop</p>
            <p>{registration.workshop?.title || "Workshop"}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">
              Số tiền cần thanh toán
            </p>
            <p className="text-3xl font-bold text-green-600">
              {formatPrice(registration.amount)}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-6 w-full bg-blue-600 text-white py-3 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold"
        >
          {submitting ? "Đang xử lý..." : "Thanh toán"}
        </button>
      </div>
    </div>
  );
}
