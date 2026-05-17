import { useRef, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { registrationService } from "../services";
import { useToast } from "../contexts/ToastContext";
import { formatPrice } from "../utils/helpers";

export default function PaymentPage() {
  const { workshopId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const shouldToastOnPaid = useRef(false);

  const [registration, setRegistration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [pendingPayment, setPendingPayment] = useState(false);
  const [pendingMessage, setPendingMessage] = useState(null);

  useEffect(() => {
    initRegistration();
  }, [workshopId]);

  useEffect(() => {
    if (!pendingPayment || !registration?.id) {
      return undefined;
    }

    const intervalId = setInterval(async () => {
      try {
        const updated = await registrationService.getRegistration(
          registration.id,
        );

        if (updated?.payment_status === "PAID") {
          setPendingPayment(false);
          setPendingMessage(null);
          handleRegistrationLoaded(updated);
          return;
        }

        setRegistration(updated);
      } catch (pollError) {
        console.error(pollError);
      }
    }, 6000);

    return () => clearInterval(intervalId);
  }, [pendingPayment, registration?.id]);

  const handleRegistrationLoaded = (data) => {
    setRegistration(data);

    if (data.payment_status !== "PAID") {
      setPendingPayment(false);
      setPendingMessage(null);
    }

    if (data.payment_status === "PAID") {
      if (shouldToastOnPaid.current) {
        const title = data.workshop?.title || "Workshop";
        showToast(
          `Đăng ký workshop "${title}" thành công, vui lòng kiểm tra email hoặc trang "workshop của tôi"`,
          { variant: "success" },
        );
        shouldToastOnPaid.current = false;
      }
      setSuccess(true);
      setTimeout(() => {
        navigate("/workshops");
      }, 3000);
    }
  };

  const waitForRegistration = async (workshopIdToPoll, attempts = 5) => {
    for (let i = 0; i < attempts; i += 1) {
      try {
        const existing =
          await registrationService.getRegistrationByWorkshop(workshopIdToPoll);
        if (existing) {
          return existing;
        }
      } catch (pollError) {
        if (pollError.response?.status !== 404) {
          throw pollError;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return null;
  };

  const initRegistration = async () => {
    try {
      setLoading(true);
      const result = await registrationService.register(workshopId);

      if (result.payment_status === "PAID") {
        shouldToastOnPaid.current = true;
      }

      let data = null;
      if (result?.registration_id) {
        data = await registrationService.getRegistration(
          result.registration_id,
        );
      } else {
        setPendingPayment(true);
        setPendingMessage(
          "Đơn đăng ký đang được tạo, vui lòng đợi một chút...",
        );
        data = await waitForRegistration(workshopId);
      }

      if (!data) {
        setError(null);
        return;
      }

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
    setPendingMessage(null);

    try {
      const result = await registrationService.confirmPayment(registration.id);

      if (!result?.ok) {
        if (result?.queued) {
          setPendingPayment(true);
          setPendingMessage(
            result?.message ||
              "Đang chờ xử lý, hệ thống sẽ tự retry thanh toán.",
          );
        } else {
          setError(
            result?.message || "Cổng thanh toán đang bận. Vui lòng thử lại.",
          );
        }
        return;
      }

      const updated = await registrationService.getRegistration(
        registration.id,
      );
      if (updated?.payment_status !== "PAID") {
        setPendingPayment(true);
        setPendingMessage("Thanh toán đang được xử lý. Vui lòng đợi...");
        setRegistration(updated);
        return;
      }

      const title = updated.workshop?.title || "Workshop";
      showToast(
        `Đăng ký workshop "${title}" thành công, vui lòng kiểm tra email hoặc trang "workshop của tôi"`,
        { variant: "success" },
      );
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
    if (pendingPayment || pendingMessage) {
      return (
        <div className="max-w-xl mx-auto text-center">
          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded">
            {pendingMessage || "Đơn đăng ký đang được xử lý..."}
          </div>
        </div>
      );
    }

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

      {pendingMessage && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded mb-4 text-sm">
          {pendingMessage}
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
          disabled={submitting || pendingPayment}
          className="mt-6 w-full bg-blue-600 text-white py-3 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold"
        >
          {submitting
            ? "Đang xử lý..."
            : pendingPayment
              ? "Đang chờ xử lý..."
              : "Thanh toán"}
        </button>
      </div>
    </div>
  );
}
