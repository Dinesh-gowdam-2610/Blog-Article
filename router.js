const express = require('express');
const BlobArticles = require('./blobArticles');
const router = express.Router();

router.get('/getBlobDetails', async (request, response) => {
  try {
    let blobResponse = await BlobArticles.getBlobDetails(request.query.page);
    console.log('blobResponse', blobResponse);
    blobResponse.data.forEach((item) => {
      blogid = item.blogid;
    });
    response.json(blobResponse);
  } catch (error) {
    response.status(500).send(error);
  }
});
router.post('/addComments', async (request, response) => {
  try {
    let addComments = await BlobArticles.addComments(
      request.body.comments,
      request.body.blogid
    );
    response.json(addComments);
  } catch (error) {
    response.status(500).send(error);
  }
});

router.post('/addBlobArticles', async (request, response) => {
  try {
    let addBlobArticles = await BlobArticles.addBlobArticles(
      request.body.title,
      request.body.body
    );
    response.json(addBlobArticles);
  } catch (error) {
    response.status(500).send(error);
  }
});
router.delete('/deleteBlobArticles', async (request, response) => {
  try {
    let deleteBlobArticles = await BlobArticles.deleteBlobArticles(
      request.body.title
    );
    response.json(deleteBlobArticles);
  } catch (error) {
    response.status(500).send(error);
  }
});
router.put('/updateBlobComments', async (request, response) => {
  try {
    let updateBlobArticles = await BlobArticles.updateBlobArticles(
      request.body.comments,
      request.body.blogid
    );
    response.json(updateBlobArticles);
  } catch (error) {
    response.status(500).send(error);
  }
});
module.exports = router;
