import { AdminPage } from "./pages/AdminPage";
import { CustomerPage } from "./pages/CustomerPage";
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
  return <CustomerPage />;
}
