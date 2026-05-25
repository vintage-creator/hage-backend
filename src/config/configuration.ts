export default () => ({
   port: parseInt(process.env.PORT || '3000', 10),
   nodeEnv: process.env.NODE_ENV || 'development',
   jwtSecret: process.env.JWT_SECRET || 'replace-me',
});
