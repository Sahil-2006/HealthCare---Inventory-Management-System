const { createApp } = require('./app');
const { createConfig } = require('./config');

const config = createConfig();
const app = createApp(config);

app.listen(config.port, config.host, () => {
  console.info(`MEDRIPPLE backend listening on http://${config.host}:${config.port}`);
});

