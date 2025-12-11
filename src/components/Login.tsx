import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type Props = {
  onLogin: () => void;
};

type LoginStep = 'credentials' | 'mfa-verify' | 'mfa-enroll';

export function Login({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // MFA state
  const [step, setStep] = useState<LoginStep>('credentials');
  const [totpCode, setTotpCode] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);

  // Check if user needs MFA verification after initial auth
  async function checkMfaStatus() {
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    
    if (factorsError) {
      setError('Error checking MFA status');
      return;
    }

    const verifiedFactors = factors?.totp?.filter(f => f.status === 'verified') || [];
    
    // Check for unverified TOTP factors (incomplete enrollment)
    const unverifiedFactors = factors?.all?.filter(
      f => f.factor_type === 'totp' && f.status === 'unverified'
    ) || [];

    // If there's an unverified factor, delete it and start fresh
    if (unverifiedFactors.length > 0 && verifiedFactors.length === 0) {
      for (const factor of unverifiedFactors) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
      await startMfaEnrollment();
      return;
    }
    
    // If user has NO verified TOTP factors, force enrollment
    if (verifiedFactors.length === 0) {
      await startMfaEnrollment();
      return;
    }

    // User has verified factors - check if they need to verify this session
    const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    
    if (aalError) {
      setError('Error checking authentication level');
      return;
    }

    // If already at AAL2, we're done
    if (aalData.currentLevel === 'aal2') {
      onLogin();
      return;
    }

    // Need to verify - use the first verified factor
    setFactorId(verifiedFactors[0].id);
    setStep('mfa-verify');
  }

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    } else {
      await checkMfaStatus();
      setLoading(false);
    }
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!factorId) {
      setError('No MFA factor found');
      setLoading(false);
      return;
    }

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });

    if (challengeError) {
      setError(challengeError.message);
      setLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: totpCode,
    });

    if (verifyError) {
      setError('Invalid code. Please try again.');
      setTotpCode('');
      setLoading(false);
      return;
    }

    onLogin();
  }

  async function startMfaEnrollment() {
    setLoading(true);
    setError(null);

    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Oakerds Accounting',
    });

    if (enrollError) {
      setError(enrollError.message);
      setLoading(false);
      return;
    }

    if (data?.totp?.qr_code) {
      setQrCodeUrl(data.totp.qr_code);
      setFactorId(data.id);
      setStep('mfa-enroll');
    }
    
    setLoading(false);
  }

  async function handleMfaEnrollVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!factorId) {
      setError('No factor ID found');
      setLoading(false);
      return;
    }

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });

    if (challengeError) {
      setError(challengeError.message);
      setLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: totpCode,
    });

    if (verifyError) {
      setError('Invalid code. Please check and try again.');
      setTotpCode('');
      setLoading(false);
      return;
    }

    onLogin();
  }

  // Shared styles
  const cardStyle = {
    backgroundColor: 'white',
    padding: '2rem',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    width: '100%',
    maxWidth: '400px',
  };

  const inputStyle = {
    width: '100%',
    padding: '0.75rem',
    borderRadius: '4px',
    border: '1px solid #ccc',
    fontSize: '1rem',
    boxSizing: 'border-box' as const,
  };

  const buttonStyle = {
    width: '100%',
    padding: '0.75rem',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#1a472a',
    color: 'white',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1,
  };

  const secondaryButtonStyle = {
    ...buttonStyle,
    backgroundColor: 'transparent',
    color: '#1a472a',
    border: '1px solid #1a472a',
    marginTop: '0.5rem',
  };

  // Render MFA verification step
  if (step === 'mfa-verify') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f5f5f5',
        }}
      >
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <img
              src="/OakerdsLogo.svg"
              alt="Oakerds Logo"
              style={{ width: '64px', height: '64px', marginBottom: '1rem' }}
            />
            <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Two-Factor Authentication</h1>
            <p style={{ color: '#666', marginTop: '0.5rem', fontSize: '0.875rem' }}>
              Enter the code from your authenticator app
            </p>
          </div>

          <form onSubmit={handleMfaVerify}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label
                htmlFor="totp"
                style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}
              >
                6-Digit Code
              </label>
              <input
                id="totp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                autoComplete="one-time-code"
                autoFocus
                required
                style={{
                  ...inputStyle,
                  textAlign: 'center',
                  fontSize: '1.5rem',
                  letterSpacing: '0.5rem',
                }}
              />
            </div>

            {error && (
              <p style={{ color: '#b00020', marginBottom: '1rem', fontSize: '0.875rem' }}>
                {error}
              </p>
            )}

            <button type="submit" disabled={loading || totpCode.length !== 6} style={buttonStyle}>
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </form>

          <button
            onClick={() => {
              setStep('credentials');
              setTotpCode('');
              setError(null);
              supabase.auth.signOut();
            }}
            style={{
              ...secondaryButtonStyle,
              cursor: 'pointer',
            }}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  // Render MFA enrollment step
  if (step === 'mfa-enroll') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f5f5f5',
        }}
      >
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <img
              src="/OakerdsLogo.svg"
              alt="Oakerds Logo"
              style={{ width: '64px', height: '64px', marginBottom: '1rem' }}
            />
            <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Set Up Two-Factor Authentication</h1>
            <p style={{ color: '#666', marginTop: '0.5rem', fontSize: '0.875rem' }}>
              Scan this QR code with your authenticator app
            </p>
          </div>

          {qrCodeUrl && (
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <img
                src={qrCodeUrl}
                alt="MFA QR Code"
                style={{ width: '200px', height: '200px', border: '1px solid #eee', borderRadius: '8px' }}
              />
            </div>
          )}

          <form onSubmit={handleMfaEnrollVerify}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label
                htmlFor="totp-enroll"
                style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}
              >
                Enter code to confirm
              </label>
              <input
                id="totp-enroll"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                autoComplete="one-time-code"
                autoFocus
                required
                style={{
                  ...inputStyle,
                  textAlign: 'center',
                  fontSize: '1.5rem',
                  letterSpacing: '0.5rem',
                }}
              />
            </div>

            {error && (
              <p style={{ color: '#b00020', marginBottom: '1rem', fontSize: '0.875rem' }}>
                {error}
              </p>
            )}

            <button type="submit" disabled={loading || totpCode.length !== 6} style={buttonStyle}>
              {loading ? 'Verifying...' : 'Complete Setup'}
            </button>
          </form>

          <button
            onClick={() => {
              setStep('credentials');
              setTotpCode('');
              setQrCodeUrl(null);
              setError(null);
              supabase.auth.signOut();
            }}
            style={{
              ...secondaryButtonStyle,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Render credentials step (default)
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
      }}
    >
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <img
            src="/OakerdsLogo.svg"
            alt="Oakerds Logo"
            style={{ width: '64px', height: '64px', marginBottom: '1rem' }}
          />
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Oakerds Accounting</h1>
        </div>

        <form onSubmit={handleCredentialsSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="email"
              style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="password"
              style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          {error && (
            <p style={{ color: '#b00020', marginBottom: '1rem', fontSize: '0.875rem' }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '0.875rem', color: '#666', marginTop: '1.5rem' }}>
          <a
            href="/privacy"
            style={{ color: '#1a472a', textDecoration: 'none' }}
            onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
          >
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
}
