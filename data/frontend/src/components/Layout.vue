<template>
  <div class="layout">
    <nav>
      <router-link to="/credentials">Credenciales</router-link>
      <router-link to="/channels">Canales</router-link>
      <router-link to="/integrations">Integraciones</router-link>
      <router-link to="/config">Configuración</router-link>
      <button class="logout" @click="logout">Salir</button>
    </nav>
    <main>
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();
function logout() {
  localStorage.removeItem("uiSecret");
  router.push("/login");
}
</script>

<style scoped>
  .layout { min-height: 100vh; display: flex; flex-direction: column; }
  nav { display: flex; gap: 1rem; padding: 1rem; border-bottom: 1px solid #334155; align-items: center; }
  nav a { text-decoration: none; }
  nav a.router-link-active { font-weight: bold; }
  .logout { margin-left: auto; }
  main { flex: 1; padding: 1.5rem; }
</style>
