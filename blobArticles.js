const db = require('./db');
const helper = require('./helper');
const config = require('./config');

async function getBlobDetails(page = 1) {
  try {
    const offset = helper.getOffset(page, config.listPerPage);
    const rows = await db(
      `SELECT * FROM blogArticles LIMIT ${offset},${config.listPerPage}`
    );
    const data = helper.emptyOrRows(rows);
    const meta = { page };
    return {
      data,
      meta,
    };
  } catch (error) {
    return { error: error, message: 'Unable to get details' };
  }
}
async function addBlobArticles(title, body) {
  try {
    let titleStringLength = "'" + title + "'".length;
    let bodyStringLength = "'" + body + "'".length;
    if (title && titleStringLength > 50 && body && bodyStringLength > 50) {
      const rows = await db(
        `INSERT INTO blogArticles (title,body) VALUES ("${title}","${body}")`
      );
      return {
        'blob Article': rows ? 'Article are Added Successfully' : [],
      };
    } else {
      return {
        error: 'Title and Body Should be Greater than 50 Characters',
      };
    }
  } catch (error) {
    return { error: error, message: error.message };
  }
}
async function deleteBlobArticles(blogtitle) {
  try {
    console.log('blogid', blogtitle);
    if (blogtitle) {
      const rows = await db(
        `DELETE FROM blogArticles WHERE title = "${blogtitle}"`
      );
      return {
        'blob Article': rows ? 'Article are Deleted Successfully' : [],
      };
    } else {
      return {
        error: 'Please Enter Title',
      };
    }
  } catch (error) {
    console.log(error);
    return { error: error, message: 'Unable to delete article' };
  }
}
async function updateBlobArticles(blogComments, blogid) {
  try {
    if (blogid && blogComments) {
      const rows = await db(
        `UPDATE updateComments SET comments = "${blogComments}" WHERE blogid = "${blogid}"`
      );
      return {
        'Update Article': rows
          ? 'Article are Updated Successfully'
          : 'Update Article Failed',
      };
    } else {
      return {
        error: 'Please Enter Comments and blogid',
      };
    }
  } catch (error) {
    console.log(error);
    return { error: error, message: 'Unable to update comments' };
  }
}
async function addComments(blogComments, blogid) {
  try {
    if (blogComments && blogid) {
      const comments = await db(
        `INSERT INTO updateComments (comments,blogid) VALUES ("${blogComments}","${blogid}")`
      );
      return {
        comments: comments ? 'Your comments added successfully' : [],
      };
    } else {
      return {
        error: 'Please Enter Comments',
      };
    }
  } catch (error) {
    console.log(error);
    return { error: error, message: 'Unable to add comments' };
  }
}

module.exports = {
  getBlobDetails,
  addComments,
  addBlobArticles,
  deleteBlobArticles,
  updateBlobArticles,
};
