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

  // Render MFA verification step
  if (step === 'mfa-verify') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-header">
            <img
              src="/OakerdsLogo.svg"
              alt="Oakerds Logo"
              className="auth-logo"
            />
            <h1 className="auth-title">Two-Factor Authentication</h1>
            <p className="auth-subtitle">
              Enter the code from your authenticator app
            </p>
          </div>

          <form onSubmit={handleMfaVerify}>
            <div className="auth-field auth-field--lg">
              <label
                htmlFor="totp"
                className="auth-label"
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
                className="auth-input auth-input--code"
              />
            </div>

            {error && (
              <p className="auth-error">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading || totpCode.length !== 6} className="auth-btn">
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
                className="auth-btn auth-btn--secondary"
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
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-header">
            <img
              src="/OakerdsLogo.svg"
              alt="Oakerds Logo"
              className="auth-logo"
            />
            <h1 className="auth-title">Set Up Two-Factor Authentication</h1>
            <p className="auth-subtitle">
              Scan this QR code with your authenticator app
            </p>
          </div>

          {qrCodeUrl && (
            <div className="auth-header">
              <img
                src={qrCodeUrl}
                alt="MFA QR Code"
                className="auth-qr"
              />
            </div>
          )}

          <form onSubmit={handleMfaEnrollVerify}>
            <div className="auth-field auth-field--lg">
              <label
                htmlFor="totp-enroll"
                className="auth-label"
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
                className="auth-input auth-input--code"
              />
            </div>

            {error && (
              <p className="auth-error">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading || totpCode.length !== 6} className="auth-btn">
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
                className="auth-btn auth-btn--secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Render credentials step (default)
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <img
            src="/OakerdsLogo.svg"
            alt="Oakerds Logo"
            className="auth-logo"
          />
          <h1 className="auth-title">Oakerds Accounting</h1>
        </div>

        <form onSubmit={handleCredentialsSubmit}>
          <div className="auth-field">
            <label
              htmlFor="email"
              className="auth-label"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="auth-input"
            />
          </div>

          <div className="auth-field auth-field--lg">
            <label
              htmlFor="password"
              className="auth-label"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="auth-input"
            />
          </div>

          {error && (
            <p className="auth-error">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="auth-btn">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="auth-footer">
          <a
            href="/privacy"
            className="auth-link"
          >
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
}
