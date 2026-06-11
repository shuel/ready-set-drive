document.getElementById("forgotPasswordForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const message = document.getElementById("message");

  message.textContent = "Sending reset link...";

  console.log("Sending reset email to:", email);

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: "http://localhost:5000/reset-password.html"
  });

  console.log("Reset response:", { data, error });

  if (error) {
    message.textContent = `Error: ${error.message}`;
    return;
  }

  message.textContent = "Password reset link sent. Please check your email.";
});