/* Authentication Module */
import { auth } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
  deleteUser,
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { gameManager } from "./game-manager.js";
import { translations } from "./translations.js";
import { getCurrentLang } from "./i18n.js";

// ... (existing code)

export async function updateUsername(newUsername) {
  const user = auth.currentUser;
  if (!user) return { success: false, error: "No user logged in." };

  try {
    // 1. Check Uniqueness
    // Dynamic import to avoid circular dependency issues if any
    const { checkUsernameAvailability, saveUserStats } =
      await import("./db.js");

    // Skip check if name is same as current
    if (user.displayName === newUsername) return { success: true };

    const isAvailable = await checkUsernameAvailability(newUsername);
    if (!isAvailable) {
      return { success: false, error: "El nombre de usuario ya está en uso." };
    }

    // 2. Update Auth Profile
    await updateProfile(user, { displayName: newUsername });

    // 3. Sync to Firestore (to reserve the name)
    const currentStats = gameManager.state.stats;
    await saveUserStats(user.uid, currentStats, newUsername);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: translateAuthError(error.code) || error.message,
    };
  }
}

let currentUser = null;

export function initAuth() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // User is signed in
      currentUser = user;
      console.log("User signed in:", user.uid);
      updateUIForLogin(user);

      // Load cloud save? handled by gameManager listener or explicit call
      // gameManager.onUserLogin(user);
      import("./db.js").then((module) => {
        module.loadUserProgress(user.uid);
        module.listenToUserProgress(user.uid); // Start Real-time Conflict Detection
      });
    } else {
      // User is signed out
      currentUser = null;
      console.log("User signed out");
      updateUIForLogout();
    }
  });
}

export async function registerUser(email, password, username) {
  try {
    const { checkUsernameAvailability, saveUserStats } =
      await import("./db.js");

    // 1. Create User (Optimistic - Authenticates the user)
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );
    const user = userCredential.user;

    // 2. Check Username Uniqueness (Now Authenticated)
    const isAvailable = await checkUsernameAvailability(username);
    if (!isAvailable) {
      // Rollback: Delete the just-created user
      try {
        await deleteUser(user);
        console.log("Rolled back user creation due to duplicate username.");
      } catch (rollbackError) {
        console.error("Rollback failed:", rollbackError);
        // We might be in a state where user exists but shouldn't.
        // But for MVP, we return the error associated with the username.
      }
      return { success: false, error: "El nombre de usuario ya está en uso." };
    }

    // 3. Set Display Name
    await updateProfile(user, {
      displayName: username,
    });

    // Force UI Update with new name (fix race condition)
    updateUIForLogin(user);

    // 4. Index Username in Firestore immediately
    await saveUserStats(user.uid, { registeredAt: new Date() }, username);

    return { success: true, user };
  } catch (error) {
    console.error("Registration Error:", error.code, error.message);
    return { success: false, error: translateAuthError(error.code) };
  }
}

export async function loginUser(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password,
    );
    return { success: true, user: userCredential.user };
  } catch (error) {
    console.error("Login Error:", error.code, error.message);
    return { success: false, error: translateAuthError(error.code) };
  }
}

export async function logoutUser() {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Sensitive Actions Helpers
async function reauthenticateUser(user, currentPassword) {
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  try {
    await reauthenticateWithCredential(user, credential);
    return { success: true };
  } catch (error) {
    // Fail silently in console, return error to UI
    return { success: false, error: translateAuthError(error.code) };
  }
}

export async function updateUserPassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user) return { success: false, error: "No user logged in." };

  // 1. Re-authenticate
  const authResult = await reauthenticateUser(user, currentPassword);
  if (!authResult.success) return authResult;

  // 2. Update Password
  try {
    await updatePassword(user, newPassword);
    return { success: true };
  } catch (error) {
    return { success: false, error: translateAuthError(error.code) };
  }
}

export async function deleteUserAccount(currentPassword) {
  const user = auth.currentUser;
  if (!user) return { success: false, error: "No user logged in." };

  // 1. Re-authenticate
  const authResult = await reauthenticateUser(user, currentPassword);
  if (!authResult.success) return authResult;

  // 2. Wipe Firestore Data (Import dynamic to avoid circular dep if possible, or assume it's safe)
  try {
    const { wipeUserData } = await import("./db.js");
    await wipeUserData(user.uid);
  } catch (e) {
    console.error("Wipe data failed, proceeding to delete account anyway:", e);
  }

  // 3. Delete Auth Account
  try {
    await deleteUser(user);
    return { success: true };
  } catch (error) {
    return { success: false, error: translateAuthError(error.code) };
  }
}

export function getCurrentUser() {
  return currentUser;
}

// UI Helpers
function updateUIForLogin(user) {
  const profileBtn = document.getElementById("btn-profile"); // Correct ID
  if (profileBtn) {
    profileBtn.classList.add("authenticated");
  }

  const loginModal = document.getElementById("login-modal");
  if (loginModal) loginModal.classList.add("hidden");

  // Show Sidebar Profile Actions
  const profileActions = document.querySelector(".profile-actions");
  if (profileActions) profileActions.classList.remove("hidden");

  // Hide Guest Actions
  const guestActions = document.querySelector(".guest-actions");
  if (guestActions) guestActions.classList.add("hidden");

  // Update Dropdown UI
  // Update Dropdown UI
  const loginWrapper = document.getElementById("login-wrapper");
  const loggedInView = document.getElementById("logged-in-view");
  const nameSpan = document.getElementById("user-display-name");

  if (loginWrapper) loginWrapper.classList.add("hidden");
  if (loggedInView) loggedInView.classList.remove("hidden");

  if (nameSpan) {
    // Use displayName if available, otherwise email prefix
    const displayName = user.displayName || user.email.split("@")[0];
    nameSpan.textContent = displayName;
  }

  // Update Profile Sidebar Email
  const profileEmail = document.getElementById("profile-email-display");
  const profileEmailSmall = document.getElementById("profile-email-small");
  const profileNameLarge = document.getElementById("profile-name-large");

  if (profileEmail) profileEmail.textContent = user.email;
  // Use display name or default to 'Usuario'
  if (profileNameLarge) {
    profileNameLarge.textContent = user.displayName || "Usuario";
  }

  if (profileEmailSmall) profileEmailSmall.textContent = "";

  // Wire up Buttons (Profile Sidebar)
  const btnChangeName = document.getElementById("btn-profile-change-name");
  if (btnChangeName) {
    btnChangeName.onclick = () => {
      showPasswordModal("change_username");
    };
  }

  const btnChangePass = document.getElementById("btn-profile-change-pw");
  if (btnChangePass) {
    btnChangePass.onclick = () => {
      showPasswordModal("change_password");
    };
  }

  const btnDelete = document.getElementById("btn-profile-delete");
  if (btnDelete) {
    btnDelete.onclick = () => {
      showPasswordModal("delete_account");
    };
  }

  // Refresh Main Profile Card
  import("./profile.js").then((module) => {
    module.updateProfileData();
  });

  // Wire Logout Button (Custom Modal)
  const btnLogout = document.getElementById("btn-profile-logout");
  if (btnLogout) {
    btnLogout.onclick = () => {
      const modal = document.getElementById("logout-confirm-modal");
      if (modal) modal.classList.remove("hidden");
    };
  }

  // Wire Logout Modal Buttons
  const btnCancelLogout = document.getElementById("btn-cancel-logout-modal");
  const btnConfirmLogout = document.getElementById("btn-confirm-logout-modal");
  const logoutModal = document.getElementById("logout-confirm-modal");

  if (btnCancelLogout && logoutModal) {
    btnCancelLogout.onclick = () => {
      logoutModal.classList.add("hidden");
    };
  }

  if (btnConfirmLogout && logoutModal) {
    btnConfirmLogout.onclick = async () => {
      const { showToast } = await import("./ui.js");
      btnConfirmLogout.textContent = "Saliendo...";
      btnConfirmLogout.disabled = true;

      const result = await logoutUser();

      btnConfirmLogout.textContent = "Cerrar Sesión";
      btnConfirmLogout.disabled = false;
      logoutModal.classList.add("hidden");

      if (result.success) {
        showToast("Sesión cerrada correctamente.");
      } else {
        showToast("Error al cerrar sesión: " + result.error);
      }
    };
  }
}

function updateUIForLogout() {
  const profileBtn = document.getElementById("btn-profile"); // Correct ID
  if (profileBtn) {
    profileBtn.classList.remove("authenticated");
  }

  // Update Dropdown UI
  const loginWrapper = document.getElementById("login-wrapper");
  const loggedInView = document.getElementById("logged-in-view");

  if (loginWrapper) loginWrapper.classList.remove("hidden");
  if (loggedInView) loggedInView.classList.add("hidden");

  // Clear Sidebar Email (explicit force)
  const profileEmail = document.getElementById("profile-email-display");
  if (profileEmail) profileEmail.textContent = "";

  // Stop Listener
  import("./db.js").then((module) => {
    module.stopListeningAndCleanup();
  });

  // Show Guest Actions
  const guestActions = document.querySelector(".guest-actions");
  if (guestActions) guestActions.classList.remove("hidden");

  // Refresh Main Profile Card (to Guest state)
  import("./profile.js").then((module) => {
    module.updateProfileData();
  });

  // Wire Guest Login Button (if not already wired)
  // Logic usually goes in initAuth, but ensuring it here or somewhere safe is good.
  const btnGuestLogin = document.getElementById("btn-profile-login-guest");
  if (btnGuestLogin) {
    btnGuestLogin.onclick = () => {
      const loginModal = document.getElementById("login-modal");
      if (loginModal) loginModal.classList.remove("hidden");
    };
  }
}

function translateAuthError(code) {
  switch (code) {
    case "auth/email-already-in-use":
      return "El correo ya está registrado.";
    case "auth/invalid-email":
      return "Correo inválido.";
    case "auth/weak-password":
      return "La contraseña es muy débil (mínimo 6 caracteres).";
    case "auth/user-not-found":
      return "Usuario no encontrado.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Contraseña incorrecta.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Intenta más tarde.";
    default:
      return "Error de autenticación: " + code;
  }
}

// Modal Logic
function showPasswordModal(actionType) {
  const modal = document.getElementById("password-confirm-modal");
  const title = document.getElementById("pwd-modal-title");
  const desc = document.getElementById("pwd-modal-desc");
  const newPassContainer = document.getElementById("new-password-container");
  const confirmInput = document.getElementById("confirm-password-input");
  const newPassInput = document.getElementById("new-password-input");
  const verifyPassInput = document.getElementById("verify-password-input");
  const textInput = document.getElementById("modal-text-input");
  const btnConfirm = document.getElementById("btn-confirm-pwd");
  const btnCancel = document.getElementById("btn-cancel-pwd");

  if (!modal) return;

  // Reset fields
  confirmInput.value = "";
  newPassInput.value = "";
  if (verifyPassInput) verifyPassInput.value = "";
  modal.classList.remove("hidden");

  // Setup Visibility Toggles (Event Delegation - Robust)
  // Check if we already attached the listener to avoid duplicates
  if (!modal.dataset.toggleListenerAttached) {
    modal.addEventListener("click", (e) => {
      const btn = e.target.closest(".toggle-password");
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();

      const wrapper = btn.closest(".password-wrapper");
      const input = wrapper ? wrapper.querySelector("input") : null;

      if (input) {
        const isPassword = input.type === "password";
        const newType = isPassword ? "text" : "password";

        input.type = newType;
        // Icon: 👁️ = Show, 🙈 = Hide (Monkey covering eyes)
        btn.textContent = isPassword ? "🙈" : "👁️";

        // Link Logic
        const verifyPassInputRef = document.getElementById(
          "verify-password-input",
        );
        if (input.id === "new-password-input" && verifyPassInputRef) {
          verifyPassInputRef.type = newType;
        }
      }
    });
    modal.dataset.toggleListenerAttached = "true";
  }

  // Determine Language
  const lang = getCurrentLang() || "es";
  const t = translations[lang] || translations["es"];

  // Configure based on action
  if (actionType === "change_username") {
    title.textContent = t.modal_change_name_title;
    desc.textContent = t.modal_change_name_desc;
    newPassContainer.classList.add("hidden");
    // Hide wrapper to hide icon too
    if (confirmInput.closest(".password-wrapper")) {
      confirmInput.closest(".password-wrapper").classList.add("hidden");
    } else {
      confirmInput.classList.add("hidden");
    }

    if (textInput) {
      textInput.classList.remove("hidden");
      textInput.placeholder = t.modal_new_name_placeholder;
      textInput.value = auth.currentUser.displayName || "";
      textInput.focus();
    }

    const newBtnConfirm = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);
    newBtnConfirm.textContent = t.btn_confirm; // Reset text

    newBtnConfirm.onclick = async () => {
      const { showToast } = await import("./ui.js");
      const newName = textInput ? textInput.value.trim() : "";
      if (!newName) {
        showToast(t.toast_name_empty);
        return;
      }

      newBtnConfirm.disabled = true;
      newBtnConfirm.textContent = t.btn_saving;

      const result = await updateUsername(newName);

      newBtnConfirm.disabled = false;
      newBtnConfirm.textContent = t.btn_confirm;

      if (result.success) {
        showToast(t.toast_name_success);
        modal.classList.add("hidden");
        // Sync Header
        const nameSpan = document.getElementById("user-display-name");
        if (nameSpan) nameSpan.textContent = newName;
        // Sync Profile Sidebar
        const profileNameLarge = document.getElementById("profile-name-large");
        if (profileNameLarge) profileNameLarge.textContent = newName;

        // Sync Rank Card (Avatar/Name)
        try {
          const { updateProfileData } = await import("./profile.js");
          updateProfileData();
        } catch (e) {
          console.error("Error updating profile card:", e);
        }
      } else {
        alert("Error: " + result.error);
      }
    };
  } else if (actionType === "change_password") {
    title.textContent = t.modal_change_pw_title;
    desc.textContent = t.modal_change_pw_desc;
    newPassContainer.classList.remove("hidden");

    // Show wrapper
    const currentWrapper = confirmInput.closest(".password-wrapper");
    if (currentWrapper) {
      currentWrapper.classList.remove("hidden");
    } else {
      confirmInput.classList.remove("hidden");
    }

    // Update Placeholders
    confirmInput.placeholder = t.placeholder_current_pw;
    newPassInput.placeholder = t.placeholder_new_pw;
    if (verifyPassInput) verifyPassInput.placeholder = t.placeholder_verify_pw;

    if (textInput) textInput.classList.add("hidden");

    // Clone to remove old listeners
    const newBtnConfirm = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);
    newBtnConfirm.textContent = t.btn_confirm;

    newBtnConfirm.onclick = async () => {
      const { showToast } = await import("./ui.js");
      const currentPass = confirmInput.value;
      const newPass = newPassInput.value;
      const verifyPass = verifyPassInput ? verifyPassInput.value : "";

      if (!currentPass || !newPass || !verifyPass) {
        showToast(t.toast_pw_empty);
        return;
      }
      if (newPass !== verifyPass) {
        showToast(t.toast_pw_mismatch);
        return;
      }
      if (newPass.length < 6) {
        showToast(t.toast_pw_short);
        return;
      }

      newBtnConfirm.disabled = true;
      newBtnConfirm.textContent = t.btn_processing;

      const result = await updateUserPassword(currentPass, newPass);

      newBtnConfirm.disabled = false;
      newBtnConfirm.textContent = t.btn_confirm;

      if (result.success) {
        showToast(t.toast_pw_success);
        modal.classList.add("hidden");
      } else {
        showToast("Error: " + result.error);
      }
    };
  } else if (actionType === "delete_account") {
    title.textContent = t.modal_delete_account_title;
    desc.textContent = t.modal_delete_account_desc;
    title.style.color = "#ff5555";
    newPassContainer.classList.add("hidden");

    // Explicitly Reset Inputs (Fix for zombie state from Change Name)
    const currentWrapper = confirmInput.closest(".password-wrapper");
    if (currentWrapper) {
      currentWrapper.classList.remove("hidden");
    } else {
      confirmInput.classList.remove("hidden");
    }

    // Update Placeholder
    confirmInput.placeholder = t.placeholder_current_pw;

    if (textInput) textInput.classList.add("hidden");

    const newBtnConfirm = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);
    newBtnConfirm.textContent = t.btn_confirm;

    newBtnConfirm.onclick = async () => {
      const { showToast } = await import("./ui.js");
      const currentPass = confirmInput.value;
      if (!currentPass) {
        showToast(t.toast_pw_enter);
        return;
      }

      /* Native Confirm Removed - Using Custom Modal */
      const deleteModal = document.getElementById(
        "delete-account-confirm-modal",
      );
      const btnCancelDelete = document.getElementById(
        "btn-cancel-delete-modal",
      );
      const btnConfirmDelete = document.getElementById(
        "btn-confirm-delete-modal",
      );

      if (deleteModal) {
        deleteModal.classList.remove("hidden");

        // Wire Cancel
        if (btnCancelDelete) {
          btnCancelDelete.onclick = () => {
            deleteModal.classList.add("hidden");
          };
        }

        // Wire Confirm
        if (btnConfirmDelete) {
          btnConfirmDelete.onclick = async () => {
            btnConfirmDelete.disabled = true;
            btnConfirmDelete.textContent = t.btn_deleting;

            const result = await deleteUserAccount(currentPass);

            if (result.success) {
              showToast(t.toast_delete_success);
              setTimeout(() => window.location.reload(), 2000);
            } else {
              btnConfirmDelete.disabled = false;
              btnConfirmDelete.textContent = t.btn_delete_all;
              showToast("Error: " + result.error);
              deleteModal.classList.add("hidden");
            }
          };
        }
      }
    };
  }

  // Wiring Cancel
  btnCancel.onclick = () => {
    modal.classList.add("hidden");
    title.style.color = "";
  };
}
