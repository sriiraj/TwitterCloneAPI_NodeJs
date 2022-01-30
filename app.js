const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");
const app = express();
app.use(express.json());
let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

const validatePassword = (password) => {
  return password.length > 5;
};

const FeedResponseStructure = (dbObject) => {
  return {
    username: dbObject.username,
    tweet: dbObject.tweet,
    dateTime: dbObject.date_time,
  };
};

const LikesResponseStructure = (LikesData) => {
  var LikesArray = [];
  var LikesObj = {};
  for (var i = 0; i < LikesData.length; i++) {
    LikesArray.push(LikesData[i].username);
  }
  LikesObj.likes = LikesArray;
  return LikesObj;
};

const RepliesResponseStructure = (RepliesData) => {
  var RepliesArray = [];
  var RepliesObj = {};
  for (var i = 0; i < RepliesData.length; i++) {
    let Obj = {};
    Obj.name = RepliesData[i].name;
    Obj.reply = RepliesData[i].reply;
    RepliesArray.push(Obj);
  }
  RepliesObj.replies = RepliesArray;
  return RepliesObj;
};
app.post("/register/", async (req, res) => {
  const { username, password, name, gender } = req.body;
  const GetUserQuery = `SELECT * FROM user where username ='${username}';`;
  const DatabaseUser = await database.get(GetUserQuery);
  if (DatabaseUser === undefined) {
    if (validatePassword(password)) {
      const HashPassword = await bcrypt.hash(password, 10);
      const CreateUser = `INSERT INTO user (username,password,name,gender) values ('${username}','${HashPassword}','${name}','${gender}');`;
      await database.run(CreateUser);
      res.send("User created successfully");
    } else {
      res.status(400);
      res.send("Password is too short");
    }
  } else {
    res.status(400);
    res.send("User already exists");
  }
});

app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);
  if (databaseUser === undefined) {
    res.status(400);
    res.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password
    );
    if (isPasswordMatched) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      res.send({ jwtToken });
    } else {
      res.status(400);
      res.send("Invalid password");
    }
  }
});

function Authenticate(req, res, next) {
  let jwtToken;
  const AuthHeader = req.headers["authorization"];
  if (AuthHeader !== undefined) {
    jwtToken = AuthHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        res.status(401);
        res.send("Invalid JWT Token");
      } else {
        req.username = payload.username;
        next();
      }
    });
  }
}

app.get("/user/tweets/feed/", Authenticate, async (req, res) => {
  const { username } = req;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userDetails = await database.get(selectUserQuery);
  const TweetFeed = `SELECT tweet.*,(select username from user where user_id=tweet.user_id) as username 
                       FROM tweet NATURAL JOIN follower 
                      where tweet.user_id = follower.following_user_id 
                      and follower.follower_user_id=${userDetails.user_id} 
                      order by tweet.date_time desc limit 4 offset 0;`;
  const FeedData = await database.all(TweetFeed);
  res.send(FeedData.map((i) => FeedResponseStructure(i)));
});

app.get("/user/following/", Authenticate, async (req, res) => {
  const { username } = req;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userDetails = await database.get(selectUserQuery);
  const FollowerFeed = `SELECT user.name FROM user NATURAL JOIN Follower where follower.following_user_id = user.user_id and follower.follower_user_id=${userDetails.user_id};`;
  const FollowerData = await database.all(FollowerFeed);
  res.send(FollowerData);
});

app.get("/user/followers/", Authenticate, async (req, res) => {
  const { username } = req;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userDetails = await database.get(selectUserQuery);
  const FollowerFeed = `SELECT user.name FROM user NATURAL JOIN Follower where follower.follower_user_id = user.user_id and follower.following_user_id=${userDetails.user_id};`;
  const FollowerData = await database.all(FollowerFeed);
  res.send(FollowerData);
});

app.get("/tweets/:tweetId/", Authenticate, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userDetails = await database.get(selectUserQuery);
  const VerifyTweetId = `select * from tweet a,follower b where a.user_id=b.following_user_id and b.follower_user_id=${userDetails.user_id} and a.tweet_id=${tweetId};`;
  const VerifyTweetData = await database.get(VerifyTweetId);
  if (VerifyTweetData === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    const FollowerFeed = `select a.tweet,
                            (select count(*) from like where tweet_id=a.tweet_id) likes,
                            (select count(*) from reply where tweet_id=a.tweet_id) replies,
                            a.date_time dateTime
                            from tweet a
                            where a.tweet_id=${tweetId}`;
    const FollowerData = await database.get(FollowerFeed);
    res.send(FollowerData);
  }
});

app.get("/tweets/:tweetId/likes/", Authenticate, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userDetails = await database.get(selectUserQuery);
  const VerifyTweetId = `select * from tweet a,follower b where a.user_id=b.following_user_id and b.follower_user_id=${userDetails.user_id} and a.tweet_id=${tweetId};`;
  const VerifyTweetData = await database.get(VerifyTweetId);
  if (VerifyTweetData === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    const LikesFeed = `select b.username from like a,user b where a.user_id=b.user_id and a.tweet_id=${tweetId}`;
    const LikesData = await database.all(LikesFeed);
    res.send(LikesResponseStructure(LikesData));
  }
});

app.get("/tweets/:tweetId/replies/", Authenticate, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userDetails = await database.get(selectUserQuery);
  const VerifyTweetId = `select * from tweet a,follower b where a.user_id=b.following_user_id and b.follower_user_id=${userDetails.user_id} and a.tweet_id=${tweetId};`;
  const VerifyTweetData = await database.get(VerifyTweetId);
  if (VerifyTweetData === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    const RepliesFeed = `select a.reply,b.name from reply a,user b where a.user_id=b.user_id and a.tweet_id=${tweetId}`;
    const RepliesData = await database.all(RepliesFeed);
    res.send(RepliesResponseStructure(RepliesData));
  }
});

app.get("/user/tweets/", Authenticate, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userDetails = await database.get(selectUserQuery);
  const UserTweetFeed = `select a.tweet,
                            (select count(*) from like where tweet_id=a.tweet_id) likes,
                            (select count(*) from reply where tweet_id=a.tweet_id) replies,
                            a.date_time dateTime
                            from tweet a
                            where a.user_id=${userDetails.user_id} `;
  const UserTweetData = await database.all(UserTweetFeed);
  res.send(UserTweetData);
});

app.post("/user/tweets/", Authenticate, async (req, res) => {
  const { username } = req;
  const { tweet } = req.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userDetails = await database.get(selectUserQuery);
  const InsertTweet = `insert into tweet (tweet,user_id,date_time) values('${tweet}',${userDetails.user_id},datetime());`;
  await database.run(InsertTweet);
  res.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", Authenticate, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userDetails = await database.get(selectUserQuery);
  const VerifyTweetId = `select * from tweet where user_id=${userDetails.user_id} and tweet_id=${tweetId};`;
  const VerifyTweetData = await database.get(VerifyTweetId);
  if (VerifyTweetData === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    const RepliesFeed = `delete from tweet  where tweet_id=${tweetId}`;
    const DeleteLikes = `delete from like  where tweet_id=${tweetId}`;
    await database.run(RepliesFeed);
    await database.run(DeleteLikes);
    res.send("Tweet Removed");
  }
});
module.exports = app;
