<template>
  <router-view />
</template>

<script setup lang="ts"></script>

<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; background: #1a1a2e; color: #eee; min-height: 100vh; }
  a { color: #7dd3fc; }
  input, button, select { padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #e2e8f0; }
  button { cursor: pointer; }
  button.primary { background: #0ea5e9; color: #fff; border-color: #0ea5e9; }
  button.danger { background: #dc2626; color: #fff; border-color: #dc2626; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #334155; }
</style>
