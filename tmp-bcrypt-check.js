const bcrypt = require('bcryptjs');
const hash = '$2a$12$KIXy1O.qn2Y5WNZL4HqkuOb.YGdPVIhXWA3RkR6QmFC3wVxlFHqG';
const password = 'password123';
console.log('match', bcrypt.compareSync(password, hash));
