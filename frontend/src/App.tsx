import { AdminPage } from "./pages/AdminPage";
import { CustomerPage } from "./pages/CustomerPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SellerPage } from "./pages/SellerPage";

export function App() {
  const path = window.location.pathname;
  if (path.startsWith("/seller")) {
    return <SellerPage />;
  }
  if (path.startsWith("/admin")) {
    return <AdminPage />;
  }
  if (path.startsWith("/register")) {
    return <RegisterPage />;
  }
  if (path.startsWith("/login")) {
    return <LoginPage />;
  }
  return <CustomerPage />;
}
