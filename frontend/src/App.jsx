import React, { Component, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { PickerUiSettingsProvider } from './context/PickerUiSettingsContext';
import { CartProvider } from './context/CartContext';
import Layout from './components/Layout';
import RouteLoader from './components/RouteLoader.jsx';
import { canAccessPath } from './utils/canAccessPath.js';

/** Do‘kon va kirish sahifalari — alohida chunk; birinchi yuklash tezroq */
const Home = lazy(() => import('./pages/Home.jsx'));
const ProductListPage = lazy(() => import('./pages/ProductListPage.jsx'));
const ProductDetail = lazy(() => import('./pages/ProductDetail.jsx'));
const Cart = lazy(() => import('./pages/Cart.jsx'));
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const Orders = lazy(() => import('./pages/Orders.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Aksiya = lazy(() => import('./pages/Aksiya.jsx'));

/** Katta rollik panellar alohida chunk */
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'));
const SellerDashboard = lazy(() => import('./pages/seller/SellerDashboard.jsx'));
const CourierDashboard = lazy(() => import('./pages/courier/CourierDashboard.jsx'));
const OperatorDashboard = lazy(() => import('./pages/operator/OperatorDashboard.jsx'));
const PickerDashboard = lazy(() => import('./pages/picker/PickerDashboard.jsx'));
const PackerDashboard = lazy(() => import('./pages/packer/PackerDashboard.jsx'));
const ExpeditorDashboard = lazy(() => import('./pages/expeditor/ExpeditorDashboard.jsx'));
const OrderReceiverDashboard = lazy(() => import('./pages/orderReceiver/OrderReceiverDashboard.jsx'));

class ErrorBoundary extends Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="container" style={{ padding: '2rem', maxWidth: 600, margin: '2rem auto' }}>
          <div className="card" style={{ padding: '1.5rem' }}>
            <h2 style={{ color: 'var(--danger, #dc2626)' }}>Sahifa yuklanmadi</h2>
            <p style={{ color: 'var(--text-muted)' }}>
              Xato yuz berdi. Brauzer konsolini (F12 → Console) ochib xato xabarini ko‘ring.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Qayta urinish
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function isSuperuser(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'superuser' || user?.role_id === 1;
}

function isSeller(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'seller';
}

function isCourier(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'courier';
}

function isOperator(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'operator';
}

function isPicker(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'picker';
}

function isPacker(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'packer';
}

function isExpeditor(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'expeditor';
}

function isOrderReceiver(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'order_receiver';
}

function GateCard({ title, message, children }) {
  return (
    <div className="container" style={{ padding: '2rem 1rem' }}>
      <div className="card" style={{ maxWidth: 620, margin: '0 auto', padding: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        {message && <p style={{ marginTop: '0.65rem', color: 'var(--text-muted)' }}>{message}</p>}
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>{children}</div>
      </div>
    </div>
  );
}

function LoadingGate() {
  return (
    <div className="container" style={{ padding: '2rem 1rem', maxWidth: 480, margin: '0 auto' }}>
      <RouteLoader />
    </div>
  );
}

function SuspensePanel({ children }) {
  return <Suspense fallback={<RouteLoader />}>{children}</Suspense>;
}

function SessionGate({ message, onRetry }) {
  const navigate = useNavigate();
  const location = useLocation();
  const from = `${location.pathname}${location.search}${location.hash}`;

  return (
    <GateCard title="Sessiya kerak" message={message || 'Sessiya tugagan yoki mavjud emas.'}>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => navigate('/login', { state: { from } })}
      >
        Kirish
      </button>
      <button type="button" className="btn btn-outline" onClick={onRetry}>Qayta tekshirish</button>
    </GateCard>
  );
}

function ForbiddenGate({ message }) {
  const navigate = useNavigate();
  return (
    <GateCard title="Ruxsat yo'q" message={message || 'Bu sahifaga kirish uchun ruxsatingiz yetarli emas.'}>
      <button type="button" className="btn btn-outline" onClick={() => navigate('/')}>Bosh sahifaga o'tish</button>
    </GateCard>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading, authStatus, authMessage, retrySession } = useAuth();
  const location = useLocation();
  const pathname = location.pathname;

  if (loading || authStatus === 'bootstrapping') return <LoadingGate />;
  if (!user || authStatus === 'expired' || authStatus === 'guest') {
    return <SessionGate message={authMessage} onRetry={retrySession} />;
  }

  const allowed = user.allowed_pages || (isSuperuser(user) ? ['*'] : []);
  if (!canAccessPath(allowed, pathname)) {
    return <ForbiddenGate message="Bu sahifa sizning rolingiz uchun ochiq emas." />;
  }

  return children;
}

function AdminRoute({ children }) {
  const { user, loading, authStatus, authMessage, retrySession } = useAuth();

  if (loading || authStatus === 'bootstrapping') return <LoadingGate />;
  if (!user || authStatus === 'expired' || authStatus === 'guest') {
    return <SessionGate message={authMessage} onRetry={retrySession} />;
  }
  if (!isSuperuser(user) || authStatus === 'forbidden') {
    return <ForbiddenGate message="Admin panel faqat superuser uchun." />;
  }

  return children;
}

function SellerRoute({ children }) {
  const { user, loading, authStatus, authMessage, retrySession } = useAuth();

  if (loading || authStatus === 'bootstrapping') return <LoadingGate />;
  if (!user || authStatus === 'expired' || authStatus === 'guest') {
    return <SessionGate message={authMessage} onRetry={retrySession} />;
  }
  if (!isSeller(user) || authStatus === 'forbidden') {
    return <ForbiddenGate message="Seller panel faqat seller roli uchun." />;
  }

  return children;
}

function CourierRoute({ children }) {
  const { user, loading, authStatus, authMessage, retrySession } = useAuth();

  if (loading || authStatus === 'bootstrapping') return <LoadingGate />;
  if (!user || authStatus === 'expired' || authStatus === 'guest') {
    return <SessionGate message={authMessage} onRetry={retrySession} />;
  }
  if (!isCourier(user) || authStatus === 'forbidden') {
    return <ForbiddenGate message="Kuryer panel faqat kuryer roli uchun." />;
  }

  return children;
}

function OperatorRoute({ children }) {
  const { user, loading, authStatus, authMessage, retrySession } = useAuth();

  if (loading || authStatus === 'bootstrapping') return <LoadingGate />;
  if (!user || authStatus === 'expired' || authStatus === 'guest') {
    return <SessionGate message={authMessage} onRetry={retrySession} />;
  }
  if (!isOperator(user) || authStatus === 'forbidden') {
    return <ForbiddenGate message="Operator panel faqat operator roli uchun." />;
  }

  return children;
}

function PickerRoute({ children }) {
  const { user, loading, authStatus, authMessage, retrySession } = useAuth();

  if (loading || authStatus === 'bootstrapping') return <LoadingGate />;
  if (!user || authStatus === 'expired' || authStatus === 'guest') {
    return <SessionGate message={authMessage} onRetry={retrySession} />;
  }
  if (!isPicker(user) || authStatus === 'forbidden') {
    return <ForbiddenGate message="Picker panel faqat picker roli uchun." />;
  }

  return children;
}

function PackerRoute({ children }) {
  const { user, loading, authStatus, authMessage, retrySession } = useAuth();

  if (loading || authStatus === 'bootstrapping') return <LoadingGate />;
  if (!user || authStatus === 'expired' || authStatus === 'guest') {
    return <SessionGate message={authMessage} onRetry={retrySession} />;
  }
  if (!isPacker(user) || authStatus === 'forbidden') {
    return <ForbiddenGate message="Packer panel faqat packer roli uchun." />;
  }

  return children;
}

function ExpeditorRoute({ children }) {
  const { user, loading, authStatus, authMessage, retrySession } = useAuth();

  if (loading || authStatus === 'bootstrapping') return <LoadingGate />;
  if (!user || authStatus === 'expired' || authStatus === 'guest') {
    return <SessionGate message={authMessage} onRetry={retrySession} />;
  }
  if (!isExpeditor(user) || authStatus === 'forbidden') {
    return <ForbiddenGate message="Ekspeditor panel faqat ekspeditor roli uchun." />;
  }

  return children;
}

function OrderReceiverRoute({ children }) {
  const { user, loading, authStatus, authMessage, retrySession } = useAuth();

  if (loading || authStatus === 'bootstrapping') return <LoadingGate />;
  if (!user || authStatus === 'expired' || authStatus === 'guest') {
    return <SessionGate message={authMessage} onRetry={retrySession} />;
  }
  if (!isOrderReceiver(user) || authStatus === 'forbidden') {
    return <ForbiddenGate message="Bu panel faqat buyurtma qabul qiluvchi roli uchun." />;
  }

  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <PickerUiSettingsProvider>
      <AuthProvider>
        <CartProvider>
        <Routes>
          {/* Kirish / ro‘yxat — Layoutsiz (header/footer yo‘q), to‘liq ekran; bo‘sh/oq ekran xatolarini kamaytiradi */}
          <Route
            path="/login"
            element={(
              <Suspense fallback={<RouteLoader />}>
                <Login />
              </Suspense>
            )}
          />
          <Route
            path="/register"
            element={(
              <Suspense fallback={<RouteLoader />}>
                <Register />
              </Suspense>
            )}
          />
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="products" element={<ProductListPage />} />
            <Route path="products/:id" element={<ProductDetail />} />
            <Route path="aksiya" element={<Aksiya />} />
            <Route path="cart" element={<Cart />} />
            <Route path="checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
            <Route path="orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
            <Route path="profile" element={<Profile />} />
          </Route>
          <Route
            path="admin"
            element={(
              <SuspensePanel>
                <AdminRoute><AdminDashboard /></AdminRoute>
              </SuspensePanel>
            )}
          />
          <Route
            path="admin/ai-operator"
            element={(
              <SuspensePanel>
                <AdminRoute>
                  <Navigate to="/admin?view=ai_calls" replace />
                </AdminRoute>
              </SuspensePanel>
            )}
          />
          <Route
            path="seller"
            element={(
              <SuspensePanel>
                <SellerRoute><SellerDashboard /></SellerRoute>
              </SuspensePanel>
            )}
          />
          <Route
            path="courier/*"
            element={(
              <SuspensePanel>
                <CourierRoute><CourierDashboard /></CourierRoute>
              </SuspensePanel>
            )}
          />
          <Route
            path="operator/*"
            element={(
              <SuspensePanel>
                <OperatorRoute><OperatorDashboard /></OperatorRoute>
              </SuspensePanel>
            )}
          />
          <Route
            path="picker/*"
            element={(
              <SuspensePanel>
                <PickerRoute><PickerDashboard /></PickerRoute>
              </SuspensePanel>
            )}
          />
          <Route
            path="packer/*"
            element={(
              <SuspensePanel>
                <PackerRoute><PackerDashboard /></PackerRoute>
              </SuspensePanel>
            )}
          />
          <Route
            path="expeditor/*"
            element={(
              <SuspensePanel>
                <ExpeditorRoute><ExpeditorDashboard /></ExpeditorRoute>
              </SuspensePanel>
            )}
          />
          <Route
            path="qabul/*"
            element={(
              <SuspensePanel>
                <OrderReceiverRoute><OrderReceiverDashboard /></OrderReceiverRoute>
              </SuspensePanel>
            )}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </CartProvider>
      </AuthProvider>
      </PickerUiSettingsProvider>
    </ThemeProvider>
  );
}