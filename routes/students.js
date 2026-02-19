const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('students/index', { page: 'students' });
});

module.exports = router;
