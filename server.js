const express = require('express');
const blobRouter = require('./router');
const app = express();

app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);
// app.get('/', (req, res) => {
//   res.json({ message: 'ok' });
// });
app.use('/', blobRouter);
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  console.error(err.message, err.stack);
  res.status(statusCode).json({ message: err.message });
  return;
});
app.listen(5000, () => {
  console.log('Server is running at port 5000');
});
