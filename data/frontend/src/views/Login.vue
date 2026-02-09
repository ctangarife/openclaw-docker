<template>
  <div class="login">
    <h1>OpenClaw – Administración</h1>
    <p>Introduce el secret de la UI para continuar.</p>
    <form @submit.prevent="submit">
      <input
        v-model="secret"
        type="password"
        placeholder="UI Secret"
        autocomplete="off"
      />
      <button type="submit" class="primary">Entrar</button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const secret = ref("");
const error = ref("");

async function submit() {
  error.value = "";
  localStorage.setItem("uiSecret", secret.value);
  try {
    const r = await fetch("/api/config", {
      headers: { "X-UI-Secret": secret.value },
    });
    if (r.ok) {
      router.push("/credentials");
      return;
    }
  } catch (_) {}
  localStorage.removeItem("uiSecret");
  error.value = "Acceso denegado. Revisa el secret.";
}
</script>

<style scoped>
  .login { max-width: 320px; margin: 4rem auto; padding: 1rem; }
  .login form { display: flex; flex-direction: column; gap: 0.75rem; }
  .login input { width: 100%; }
  .error { color: #f87171; margin-top: 0.5rem; }
</style>
