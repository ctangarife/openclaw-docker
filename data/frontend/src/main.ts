import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import Login from "./views/Login.vue";
import Credentials from "./views/Credentials.vue";
import Config from "./views/Config.vue";
import Channels from "./views/Channels.vue";
import Telegram from "./views/Telegram.vue";
import Integrations from "./views/Integrations.vue";
import AgentBrowser from "./views/AgentBrowser.vue";
import Layout from "./components/Layout.vue";

const routes = [
  { path: "/login", component: Login, meta: { public: true } },
  {
    path: "/",
    component: Layout,
    children: [
      { path: "", redirect: "/credentials" },
      { path: "credentials", component: Credentials },
      { path: "config", component: Config },
      { path: "channels", component: Channels },
      { path: "integrations", component: Integrations },
      { path: "agent-browser", component: AgentBrowser },
    ],
  },
];

const router = createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes });

router.beforeEach((to, _from, next) => {
  const secret = localStorage.getItem("uiSecret");
  if (!to.meta.public && !secret) return next("/login");
  next();
});

createApp(App).use(router).mount("#app");
