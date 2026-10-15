const APP_NAME = 'RideColab';

function App() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F3F4F6',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: '48px 64px',
          boxShadow: '0 4px 24px rgba(15,27,51,0.10)',
          textAlign: 'center',
        }}
      >
        {/* Logo mark */}
        <div
          style={{
            width: 64,
            height: 64,
            background: '#0F1B33',
            borderRadius: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            fontSize: 32,
          }}
        >
          🛵
        </div>

        <h1 style={{ color: '#0F1B33', fontSize: 28, fontWeight: 700, margin: '0 0 8px' }}>
          {APP_NAME} Admin
        </h1>

        <p style={{ color: '#6B7280', fontSize: 15, margin: '0 0 32px' }}>
          "Share the road. Split the cost. Nobody profits."
        </p>

        <div
          style={{
            background: '#F3F4F6',
            borderRadius: 10,
            padding: '16px 24px',
            marginBottom: 8,
          }}
        >
          <p style={{ color: '#0E9384', fontWeight: 600, margin: 0, fontSize: 14 }}>
            ✅ Admin scaffold running — Phase 1 complete
          </p>
          <p style={{ color: '#6B7280', margin: '4px 0 0', fontSize: 13 }}>
            Full admin panel coming in Phase 11
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
