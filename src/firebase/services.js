import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signInWithEmailAndPassword, signInWithPopup, signOut, signInWithRedirect, getRedirectResult } from "firebase/auth";
import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { deleteObject, getBlob, getDownloadURL, getStorage, ref } from "firebase/storage";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getFirebaseApp, hasFirebaseConfig } from "./config";

let auth = null;
let db = null;
let storage = null;

function ensureFirebaseClients() {
    if (!hasFirebaseConfig()) return null;
    if (auth && db && storage) return { auth, db, storage };

    const app = getFirebaseApp();
    auth = getAuth(app);
    // WebView2 (Tauri) חוסם לעיתים את ה-WebChannel transport של Firestore → סנכרון נתקע.
    // long-polling אוטומטי פותר; נופלים ל-getFirestore אם כבר אותחל.
    try {
        db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
    } catch {
        db = getFirestore(app);
    }
    storage = getStorage(app);
    return { auth, db, storage };
}

function normalizeCourse(docSnap) {
    const data = docSnap.data() || {};
    return {
        id: docSnap.id,
        title: data.title || data.name || `קורס ${docSnap.id}`,
        ...data,
    };
}

function normalizeMaterial(docSnap, courseId = "") {
    const data = docSnap.data() || {};
    return {
        id: docSnap.id,
        courseId: data.courseId || courseId || "",
        title: data.title || data.name || data.fileName || docSnap.id,
        type: String(data.type || "").toLowerCase(),
        storagePath: data.storagePath || data.path || "",
        storageUrl: data.storageUrl || data.url || "",
        updatedAt: data.updatedAt || null,
        ...data,
    };
}

function normalizeCloudDocument(docSnap) {
    const data = docSnap.data() || {};
    return {
        id: docSnap.id,
        ownerId: data.ownerId || "",
        title: data.title || "מסמך בענן",
        html: data.html || "<p></p>",
        text: data.text || "",
        templateId: data.templateId || "blank",
        documentStyle: data.documentStyle || "academic",
        filePath: data.filePath || "",
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
        ...data,
    };
}

export function isCloudAvailable() {
    return hasFirebaseConfig();
}

export function onCloudAuthChange(callback) {
    const clients = ensureFirebaseClients();
    if (!clients) {
        callback(null);
        return () => {};
    }
    return onAuthStateChanged(clients.auth, callback);
}

export async function cloudSignIn(email, password) {
    const clients = ensureFirebaseClients();
    if (!clients) throw new Error("Firebase config is missing.");
    const result = await signInWithEmailAndPassword(clients.auth, email, password);
    return result.user;
}

export async function cloudSignInWithGooglePopup() {
    const clients = ensureFirebaseClients();
    if (!clients) throw new Error("Firebase config is missing.");

    // דסקטופ (Tauri): signInWithPopup לא עובד ב-WebView — זרימת OAuth מקומית (loopback)
    if (typeof window !== "undefined" && typeof window.desktopApp?.googleOAuth === "function") {
        const res = await window.desktopApp.googleOAuth();
        if (!res?.ok || !res.idToken) {
            throw new Error(res?.error || "התחברות Google נכשלה.");
        }
        return cloudSignInWithGoogleIdToken(res.idToken, res.accessToken);
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
        const result = await signInWithPopup(clients.auth, provider);
        return result.user;
    } catch (error) {
        if (error.code === 'auth/internal-error' || error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
            console.warn("Popup sign-in failed, falling back to redirect.", error);
            await signInWithRedirect(clients.auth, provider);
            return null;
        }
        throw error;
    }
}

export async function handleCloudRedirectResult() {
    const clients = ensureFirebaseClients();
    if (!clients) return null;
    try {
        const result = await getRedirectResult(clients.auth);
        return result?.user || null;
    } catch (e) {
        console.error("Cloud redirect auth error:", e);
        return null;
    }
}

export async function cloudSignInWithGoogleIdToken(idToken, accessToken = "") {
    const clients = ensureFirebaseClients();
    if (!clients) throw new Error("Firebase config is missing.");
    if (!idToken && !accessToken) throw new Error("Missing Google auth token.");

    const credential = GoogleAuthProvider.credential(idToken || null, accessToken || null);
    const result = await signInWithCredential(clients.auth, credential);
    return result.user;
}

export async function cloudSignOut() {
    const clients = ensureFirebaseClients();
    if (!clients) return;
    await signOut(clients.auth);
}

export async function ensureCloudUserProfile(user) {
    const clients = ensureFirebaseClients();
    if (!clients || !user?.uid) return null;

    const userRef = doc(clients.db, "users", user.uid);
    const snapshot = await getDoc(userRef);
    const existing = snapshot.exists() ? snapshot.data() || {} : {};

    const payload = {
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        photoURL: user.photoURL || "",
        lastLoginAt: serverTimestamp(),
    };

    if (!snapshot.exists()) {
        payload.createdAt = serverTimestamp();
    }

    await setDoc(userRef, {
        ...existing,
        ...payload,
    }, { merge: true });

    return {
        ...existing,
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        photoURL: user.photoURL || "",
    };
}

export async function syncSettingsToCloud(user, settingsPayload) {
    const clients = ensureFirebaseClients();
    if (!clients) throw new Error("Firebase config is missing.");
    if (!user?.uid) throw new Error("User must be signed in.");
    
    const docRef = doc(clients.db, "users", user.uid, "settings", "main");
    const profileUpdatedAt = Number(settingsPayload?.profileUpdatedAt || 0) || Date.now();
    const appSettings = settingsPayload?.appSettings && typeof settingsPayload.appSettings === "object"
        ? settingsPayload.appSettings
        : {};
    const providerConfig = settingsPayload?.providerConfig && typeof settingsPayload.providerConfig === "object"
        ? settingsPayload.providerConfig
        : null;

    // אנטי-דריסה: לעולם לא לדרוס נתונים בענן עם מקומי ריק (מנע מחיקת מפתחות).
    // merge:true שומר שדות קיימים בענן כשמשמיטים אותם.
    const cleanPayload = { ...settingsPayload, updatedAt: serverTimestamp() };
    if (!providerConfig || !Object.keys(providerConfig).length) delete cleanPayload.providerConfig;
    if (!Object.keys(appSettings).length) delete cleanPayload.appSettings;
    await setDoc(docRef, cleanPayload, { merge: true });

    await setDoc(doc(clients.db, "users", user.uid), {
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        photoURL: user.photoURL || "",
        profileSyncedAt: serverTimestamp(),
        profileSync: {
            schemaVersion: Number(settingsPayload?.schemaVersion || 1),
            profileUpdatedAt,
            settingsDocument: "settings/main",
            appSettingsCount: Object.keys(appSettings).length,
            providerConfigSynced: Boolean(providerConfig),
        },
    }, { merge: true });
}

export async function fetchSettingsFromCloud(user) {
    const clients = ensureFirebaseClients();
    if (!clients || !user?.uid) return null;

    const docRef = doc(clients.db, "users", user.uid, "settings", "main");
    const snapshot = await getDoc(docRef);
    return snapshot.exists() ? snapshot.data() : null;
}

// ---- E2EE key bundle ----
// נשמר במסמך נפרד: users/{uid}/settings/cryptoMeta. מכיל את מעטפות ה-DEK בלבד —
// לא סודי: ה-salts גלויים בעיצוב, וה-wrapped* הם DEK מוצפן ב-passphrase/recovery code.
// הסודות עצמם (passphrase, recovery code, DEK) אף פעם לא נשמרים. משמש לפתיחה במכשיר חדש.
function isStorableBundle(bundle) {
    return Boolean(
        bundle
        && bundle.passSalt
        && bundle.recoverySalt
        && bundle.wrappedByPass?.ct && bundle.wrappedByPass?.iv
        && bundle.wrappedByRecovery?.ct && bundle.wrappedByRecovery?.iv,
    );
}

export async function saveCloudCryptoMeta(user, bundle) {
    const clients = ensureFirebaseClients();
    if (!clients) throw new Error("Firebase config is missing.");
    if (!user?.uid) throw new Error("User must be signed in.");
    if (!isStorableBundle(bundle)) throw new Error("Invalid crypto key bundle.");

    const docRef = doc(clients.db, "users", user.uid, "settings", "cryptoMeta");
    await setDoc(docRef, {
        version: Number(bundle.version || 1),
        passSalt: bundle.passSalt,
        recoverySalt: bundle.recoverySalt,
        wrappedByPass: bundle.wrappedByPass,
        wrappedByRecovery: bundle.wrappedByRecovery,
        updatedAt: serverTimestamp(),
    }, { merge: true });
}

export async function fetchCloudCryptoMeta(user) {
    const clients = ensureFirebaseClients();
    if (!clients || !user?.uid) return null;

    const snapshot = await getDoc(doc(clients.db, "users", user.uid, "settings", "cryptoMeta"));
    if (!snapshot.exists()) return null;
    const data = snapshot.data() || {};
    if (!isStorableBundle(data)) return null;
    return {
        version: Number(data.version || 1),
        passSalt: data.passSalt,
        recoverySalt: data.recoverySalt,
        wrappedByPass: data.wrappedByPass,
        wrappedByRecovery: data.wrappedByRecovery,
    };
}

// מחיקת ה-bundle מהענן = השבתת הצפנה לחשבון. אחרי זה הסנכרון יחזור לגלוי.
export async function deleteCloudCryptoMeta(user) {
    const clients = ensureFirebaseClients();
    if (!clients || !user?.uid) return;
    await deleteDoc(doc(clients.db, "users", user.uid, "settings", "cryptoMeta"));
}

export async function saveCloudDocument({
    user,
    documentId = "",
    title = "",
    html = "<p></p>",
    text = "",
    templateId = "blank",
    documentStyle = "academic",
    filePath = "",
    sessionId = "",
} = {}) {
    const clients = ensureFirebaseClients();
    if (!clients) throw new Error("Firebase config is missing.");
    if (!user?.uid) throw new Error("User must be signed in.");

    const resolvedDocumentId = String(documentId || sessionId || "").trim() || `doc-${Date.now().toString(36)}`;
    const docRef = doc(clients.db, "users", user.uid, "documents", resolvedDocumentId);
    const existing = await getDoc(docRef);

    const payload = {
        ownerId: user.uid,
        title: String(title || "").trim() || "מסמך חדש",
        html: String(html || "<p></p>"),
        text: String(text || ""),
        templateId: String(templateId || "blank").trim() || "blank",
        documentStyle: String(documentStyle || "academic").trim() || "academic",
        filePath: String(filePath || "").trim(),
        sessionId: String(sessionId || "").trim(),
        updatedAt: serverTimestamp(),
    };

    if (!existing.exists()) {
        payload.createdAt = serverTimestamp();
    }

    await setDoc(docRef, payload, { merge: true });

    return {
        id: resolvedDocumentId,
        ...payload,
    };
}

export async function listCloudDocuments(user, maxResults = 20) {
    const clients = ensureFirebaseClients();
    if (!clients || !user?.uid) return [];

    const documentsQuery = query(
        collection(clients.db, "users", user.uid, "documents"),
        orderBy("updatedAt", "desc"),
        limit(Math.max(1, Number(maxResults) || 20))
    );

    const snapshot = await getDocs(documentsQuery);
    return snapshot.docs.map(normalizeCloudDocument);
}

export async function getCloudDocument(user, documentId = "") {
    const clients = ensureFirebaseClients();
    if (!clients) throw new Error("Firebase config is missing.");
    if (!user?.uid) throw new Error("User must be signed in.");

    const resolvedDocumentId = String(documentId || "").trim();
    if (!resolvedDocumentId) throw new Error("Missing cloud document id.");

    const snapshot = await getDoc(doc(clients.db, "users", user.uid, "documents", resolvedDocumentId));
    if (!snapshot.exists()) return null;
    return normalizeCloudDocument(snapshot);
}

// --- WordFlow Clipper: קליפים שמגיעים מתוסף הדפדפן (users/{uid}/clips) ---

export async function fetchPendingClips(user, maxResults = 10) {
    const clients = ensureFirebaseClients();
    if (!clients || !user?.uid) return [];
    const q = query(
        collection(clients.db, "users", user.uid, "clips"),
        where("status", "==", "pending"),
        limit(maxResults),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
}

export async function updateClipStatus(user, clipId, patch = {}) {
    const clients = ensureFirebaseClients();
    if (!clients || !user?.uid || !clipId) return;
    await setDoc(
        doc(clients.db, "users", user.uid, "clips", clipId),
        { ...patch, processedAt: serverTimestamp() },
        { merge: true },
    );
}

export async function downloadClipImageBytes(user, storagePath) {
    const clients = ensureFirebaseClients();
    if (!clients || !storagePath) throw new Error("Missing clip storage path.");
    const blob = await getBlob(ref(clients.storage, storagePath));
    return new Uint8Array(await blob.arrayBuffer());
}

export async function deleteClipDoc(user, clipId) {
    const clients = ensureFirebaseClients();
    if (!clients || !user?.uid || !clipId) return;
    await deleteDoc(doc(clients.db, "users", user.uid, "clips", clipId));
}

// אחרי קליטה מוצלחת התמונה הגולמית נמחקת — הטקסט שחולץ הוא מה שנשמר.
export async function deleteClipImage(user, storagePath) {
    const clients = ensureFirebaseClients();
    if (!clients || !storagePath) return;
    try {
        await deleteObject(ref(clients.storage, storagePath));
    } catch { /* לא קריטי — נשאר קובץ יתום בענן */ }
}

export async function fetchCoursesForUser(user) {
    const clients = ensureFirebaseClients();
    if (!clients) return [];

    const snapshot = await getDocs(collection(clients.db, "courses"));
    const all = snapshot.docs.map(normalizeCourse);
    if (!user?.uid) return all;

    return all.filter((course) => {
        const owner = course.ownerId || course.userId || course.uid || "";
        if (!owner) return true;
        return owner === user.uid;
    });
}

export async function fetchMaterialsForCourse(courseId) {
    const clients = ensureFirebaseClients();
    if (!clients || !courseId) return [];

    const topQuery = query(
        collection(clients.db, "materials"),
        where("courseId", "==", courseId),
        limit(300)
    );

    const topSnapshot = await getDocs(topQuery);
    const nestedSnapshot = await getDocs(collection(clients.db, "courses", courseId, "materials"));
    const all = [
        ...topSnapshot.docs.map((docSnap) => normalizeMaterial(docSnap, courseId)),
        ...nestedSnapshot.docs.map((docSnap) => normalizeMaterial(docSnap, courseId)),
    ];

    const unique = new Map();
    all.forEach((material) => {
        const key = `${material.courseId || courseId}:${material.id}`;
        if (!unique.has(key)) unique.set(key, material);
    });
    return [...unique.values()];
}

export async function resolveMaterialDownloadUrl(material) {
    const clients = ensureFirebaseClients();
    if (!clients) throw new Error("Firebase config is missing.");

    if (material.storageUrl) return material.storageUrl;
    if (!material.storagePath) throw new Error("Missing storagePath/storageUrl for material.");

    return getDownloadURL(ref(clients.storage, material.storagePath));
}

export async function downloadMaterialBlob(material) {
    const clients = ensureFirebaseClients();
    if (!clients) throw new Error("Firebase config is missing.");

    if (material.storagePath) {
        try {
            return await getBlob(ref(clients.storage, material.storagePath));
        } catch (e) {
            if (!material.storageUrl) throw e;
        }
    }

    const url = await resolveMaterialDownloadUrl(material);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Material download failed: ${res.status}`);
    return res.blob();
}
