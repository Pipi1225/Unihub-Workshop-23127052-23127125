import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authService } from "../services";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const googleButtonRef = useRef(null);
  const [googleReady, setGoogleReady] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/workshops");
      return;
    }

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      return;
    }

    const initializeGoogle = () => {
      if (!window.google?.accounts?.id || !googleButtonRef.current) {
        return;
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          try {
            const response = await authService.loginWithGoogle(credential);
            const { user, token } = response;
            login(user, token);
            navigate("/workshops");
          } catch (error) {
            console.error("Login failed:", error);
            alert("Đăng nhập thất bại. Vui lòng thử lại.");
          }
        },
      });

      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: "standard",
        shape: "pill",
        theme: "outline",
        text: "signin_with",
        size: "large",
        width: "320",
      });

      setGoogleReady(true);
    };

    if (window.google?.accounts?.id) {
      initializeGoogle();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogle;
    document.body.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [isAuthenticated, login, navigate]);

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-500 to-blue-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-blue-600 mb-2">📚</h1>
          <h2 className="text-3xl font-bold text-gray-800">Workshop</h2>
          <p className="text-gray-600 mt-2">Hệ thống quản lý workshop</p>
        </div>

        <div className="w-full flex justify-center">
          <div ref={googleButtonRef} />
        </div>

        {!googleReady && (
          <p className="text-center text-sm text-gray-500 mt-3">
            Đang tải Google Sign-In...
          </p>
        )}

        <p className="text-center text-gray-600 text-sm mt-8">
          Chỉ có tài khoản được cấp trước từ quản trị viên mới có thể đăng nhập.
        </p>
      </div>
    </div>
  );
}
