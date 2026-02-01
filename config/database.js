const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/job-scraper';
    
    // Skip connection if explicitly disabled
    if (process.env.DISABLE_MONGODB === 'true') {
      console.log('⚠️  MongoDB disabled via environment variable');
      console.log('📝 Jobs will be saved to JSON file only');
      return;
    }
    
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Fail fast if can't connect
      socketTimeoutMS: 45000,
    });

    console.log('✅ MongoDB connected successfully');
    console.log(`📦 Database: ${mongoose.connection.name}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.log('⚠️  Running without database - jobs will be saved to JSON file only');
    console.log('💡 To use MongoDB:');
    console.log('   1. Set up MongoDB Atlas: https://www.mongodb.com/cloud/atlas');
    console.log('   2. Update MONGODB_URI in .env file');
    console.log('   3. Or set DISABLE_MONGODB=true to suppress this warning');
    // Don't exit - allow app to run without DB
  }
};

module.exports = connectDB;
