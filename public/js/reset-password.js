const message = document.getElementById("message");

supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    message.textContent = "Enter your new password below.";
  }
});

document.getElementById("resetPasswordForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (password !== confirmPassword) {
    message.textContent = "Passwords do not match.";
    return;
  }

  if (password.length < 6) {
    message.textContent = "Password must be at least 6 characters.";
    return;
  }

  message.textContent = "Updating password...";

  const { error } = await supabase.auth.updateUser({
    password: password
  });

  if (error) {
    message.textContent = `Error: ${error.message}`;
    return;
  }

  message.textContent = "Password updated successfully. Redirecting...";

  setTimeout(() => {
    window.location.href = "/login.html";
  }, 1500);
});