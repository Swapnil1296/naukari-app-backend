const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  company: {
    type: String,
    required: true,
  },
  location: {
    type: String,
    required: true,
  },
  link: {
    type: String,
    required: true,
    unique: true, // Prevent duplicate jobs
  },
  reason: {
    type: String,
    default: 'N/A',
  },
  appliedAt: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['applied', 'skipped', 'failed', 'already_applied'],
    default: 'skipped',
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400, // TTL: 24 hours (in seconds) - auto-delete after 1 day
  },
}, {
  timestamps: true,
});

// createdAt index is created by expires (TTL); link unique index is created by unique: true above
jobSchema.index({ status: 1 });

// Virtual for checking if applied
jobSchema.virtual('isApplied').get(function() {
  return this.status === 'applied' && this.appliedAt !== null;
});

// Method to determine status from reason
jobSchema.methods.determineStatus = function() {
  if (this.appliedAt && this.appliedAt !== 'N/A') {
    this.status = 'applied';
  } else if (this.reason.includes('Already applied')) {
    this.status = 'already_applied';
  } else if (this.reason.includes('failed') || this.reason.includes('Navigation failed')) {
    this.status = 'failed';
  } else {
    this.status = 'skipped';
  }
  return this.status;
};

const Job = mongoose.model('Job', jobSchema);

module.exports = Job;
