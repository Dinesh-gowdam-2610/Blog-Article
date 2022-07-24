const mysql = require('mysql2/promise');
const config = require('./config');

async function query(sql, params) {
  console.log('query');
  try {
    const connection = await mysql.createConnection(config.db);
    // connection.connect()
    connection.connect(function (err) {
      if (err) {
        console.error(err);
      } else {
        console.log('Connected!');
      }
    });
    const [results] = await connection.execute(sql, params);

    return results;
  } catch (e) {
    console.log(e);
  }
}

module.exports = query;
