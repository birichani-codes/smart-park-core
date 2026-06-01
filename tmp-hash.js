const bcrypt=require('bcryptjs');
const hash=bcrypt.hashSync('password123',12);
console.log(hash);
