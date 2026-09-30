import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import baseFirebaseConfig from '../../firebase-applet-config.json';

export interface FirebaseConfigType {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
  oAuthClientId?: string;
  recaptchaSiteKey?: string;
}

export function getActiveFirebaseConfig(): FirebaseConfigType {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('wc_custom_firebase_config');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (
          parsed?.apiKey === 'AIzaSyAiXwQy74tSMJoYKykBvVe1XNWxcQIZMFU' ||
          !parsed?.apiKey
        ) {
          localStorage.removeItem('wc_custom_firebase_config');
        } else if (parsed?.apiKey && parsed?.projectId) {
          return { ...baseFirebaseConfig, ...parsed };
        }
      }
    } catch {
      // ignore
    }
  }
  return baseFirebaseConfig as FirebaseConfigType;
}

export function saveCustomFirebaseConfig(config: Partial<FirebaseConfigType>): void {
  if (typeof window !== 'undefined') {
    const current = getActiveFirebaseConfig();
    const merged = { ...current, ...config };
    localStorage.setItem('wc_custom_firebase_config', JSON.stringify(merged));
  }
}

export function resetFirebaseConfig(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('wc_custom_firebase_config');
  }
}

const activeConfig = getActiveFirebaseConfig();
const app = getApps().length === 0 ? initializeApp(activeConfig) : getApps()[0];

export const db =
  activeConfig.firestoreDatabaseId && activeConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, activeConfig.firestoreDatabaseId)
    : getFirestore(app);

export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface DiagnosticResult {
  apiKey: string;
  projectId: string;
  authStatus: 'valid' | 'invalid_key' | 'disabled_provider' | 'error';
  authMessage: string;
  firestoreStatus: 'connected' | 'not_found' | 'permission_denied' | 'offline' | 'error';
  firestoreMessage: string;
}

export async function runFirebaseDiagnostics(): Promise<DiagnosticResult> {
  const cfg = getActiveFirebaseConfig();
  const res: DiagnosticResult = {
    apiKey: cfg.apiKey ? `${cfg.apiKey.substring(0, 8)}...${cfg.apiKey.slice(-4)}` : 'None',
    projectId: cfg.projectId,
    authStatus: 'error',
    authMessage: 'Checking...',
    firestoreStatus: 'error',
    firestoreMessage: 'Checking...',
  };

  // 1. Test Auth via Identity Toolkit
  try {
    const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${cfg.apiKey}`;
    const authResp = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }),
    });
    const authData = await authResp.json();

    if (authResp.ok) {
      res.authStatus = 'valid';
      res.authMessage = 'Identity Toolkit accepted API key! (Anonymous/Auth ready)';
    } else {
      const msg = authData?.error?.message || '';
      if (msg.includes('API key not valid') || authData?.error?.details?.[0]?.reason === 'API_KEY_INVALID') {
        res.authStatus = 'invalid_key';
        res.authMessage = 'API key not valid (API_KEY_INVALID). Check Google Cloud / Firebase Console.';
      } else if (msg.includes('OPERATION_NOT_ALLOWED') || msg.includes('ADMIN_ONLY_OPERATION')) {
        res.authStatus = 'disabled_provider';
        res.authMessage = 'API key is valid, but Anonymous or Email sign-in is disabled in Firebase Console.';
      } else {
        res.authStatus = 'error';
        res.authMessage = msg || 'Auth check returned error.';
      }
    }
  } catch (err) {
    res.authStatus = 'error';
    res.authMessage = err instanceof Error ? err.message : 'Network fetch failed';
  }

  // 2. Test Firestore
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    res.firestoreStatus = 'connected';
    res.firestoreMessage = 'Connected to Firestore server successfully!';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('offline')) {
      res.firestoreStatus = 'offline';
      res.firestoreMessage = 'Client is offline or network restricted.';
    } else if (msg.includes('permission') || msg.includes('Missing or insufficient permissions')) {
      res.firestoreStatus = 'permission_denied';
      res.firestoreMessage = 'Database reached, but security rules require authenticated access.';
    } else if (msg.includes('404') || msg.includes('not found') || msg.includes('NOT_FOUND')) {
      res.firestoreStatus = 'not_found';
      res.firestoreMessage = 'Firestore database or project not found. Create a (default) database in Firestore console.';
    } else {
      res.firestoreStatus = 'connected';
      res.firestoreMessage = 'Database endpoint reached.';
    }
  }

  return res;
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline or network restricted.');
      return false;
    }
    return true;
  }
}

// Test connection silently in background
testConnection().catch(() => {});
