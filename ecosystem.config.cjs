/** @type {import('pm2').StartOptions} */
module.exports = {
  apps: [
    {
      name: 'invoice_generator',
      cwd: __dirname,
      script: 'npm',
      args: ['run', 'start'],
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'invoice_generator_worker',
      cwd: __dirname,
      script: 'npm',
      args: ['run', 'worker'],
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
