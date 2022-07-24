const mongoose = require('mongoose');
const moment = require('moment');
const UserSchema = new mongoose.Schema({
  title: {
    type: String,
    max: 100,
    required: true,
  },
  body: {
    type: String,
    max: 100,
    required: true,
  },
  date: {
    type: String,
    default: moment().format('DD/MM/YYYY'),
  },
});

const User = mongoose.model('User', UserSchema);

module.exports = User;
