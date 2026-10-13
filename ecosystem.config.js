module.exports = {
  apps: [
    {
      name: 'monitor',
      script: './src/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      time: true,
      env_file: '.env',
      env: { NODE_ENV: 'production', PORT: 3000 },
      out_file: './logs/out.log',
      error_file: './logs/err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
