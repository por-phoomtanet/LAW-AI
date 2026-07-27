import { validateEnv, env } from "./utils/env";

validateEnv();

const { app } = await import("./app");

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});
