'use strict';

// Local ESLint plugin, installed as "eslint-plugin-local" via a file: dependency.
module.exports = {
  rules: {
    'no-server-in-client': require('./no-server-in-client'),
  },
};
