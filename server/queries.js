const { Client } = require('pg');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto-random-string');
const moment = require('moment');
const aws = require('aws-sdk');
const multiparty = require('multiparty');
const fs = require('fs');
const { url } = require('inspector');

require('dotenv').config();


const resetExpirationAmount = 15;
const resetExpirationUnit = 'minutes';

/*
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});
*/

const client = new Client({
  host: 'localhost',
  database: 'demo', user: 'demo', password: 'demo', port: '5433'
});

aws.config.update({
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
  signatureVersion: 'v4',
  region: 'us-east-2'
});

const s3 = new aws.S3();

const uploadFile = (buffer, name) => {
  const params = {
    ACL: 'public-read',
    Body: buffer,
    Bucket: process.env.S3_BUCKET,
    Key: `${name}`
  };

  return s3.upload(params).promise();
};

client.connect((err) => {
  if (err) {
    console.log(err);
  } else {
    console.log('Connected to database.');
  }
});

/**
 * Login and Registration Queries
 */

const createUser = ((req, res) => {
  const info = req.body;

  const sql = "INSERT INTO Users VALUES(default, default, $1, $2, $3, crypt($4, gen_salt('bf')), false);";
  const values = [info.email.trim(), info.firstName.trim(), info.lastName.trim(), info.password];

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(409).send('Email has already been taken by another account.');
    } else {
      res.status(201).send('User created!');
    }
  });
});

const createLoginToken = (userID) => {
  const payload = { userID };
  const token = jwt.sign(payload, process.env.JWT_KEY);
  return token;
}

const loginUser = ((req, res) => {
  const info = req.body;

  let sql = "SELECT id FROM Users WHERE email=$1 AND oauth!=true AND password=crypt($2, password);";
  let values = [info.email, info.password];

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send('Something went wrong.');
    } else if (!result.rows.length) {
      sql = "SELECT * FROM Users WHERE email=$1 AND oauth=true";
      values = [info.email];
			client.query(sql, values, (err, result) => {
				if (err) {
          res.status(400).send('Something went wrong.');
        } else if (!result.rows.length) {
          res.status(401).send('Invalid email or password.');
        } else {
          res.status(403).send('This account was created via Facebook.');
        }
      });
    } else {
      // Issue authorization token.
      const token = createLoginToken(result.rows[0].id);
      res.cookie('LOGIN_TOKEN', {expires: Date.now()});
      res.cookie('LOGIN_TOKEN', token, { httpOnly: true }).status(200).send('Token sent!');
    }
  });
});

const loginFacebook = (req, res) => {
  const info = req.body;

  let sql = "SELECT id FROM Users WHERE email=$1 AND oauth=true;";
  let values = [info.email];

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send('Something went wrong.');
    } else if (!result.rows.length) {
      sql = "INSERT INTO Users VALUES(default, default, $1, $2, '', '', true) RETURNING id;";
      values = [info.email, info.name];
      client.query(sql, values, (err, result) => {
        if (err) {
          res.status(400).send('Something went wrong.');
        } else {
          const token = createLoginToken(result.rows[0].id);
          res.cookie('LOGIN_TOKEN', {expires: Date.now()});
          res.cookie('LOGIN_TOKEN', token, { httpOnly: true }).status(201).send('Facebook account added.');
        }
      });
    } else {
      const token = createLoginToken(result.rows[0].id);
      res.cookie('LOGIN_TOKEN', {expires: Date.now()});
      res.cookie('LOGIN_TOKEN', token, { httpOnly: true }).status(200).send('Facebook login accepted.');
    }
  })
}

const forgotPassword = ((req, res) => {
  const info = req.body;

  let sql = "SELECT id FROM Users WHERE email=$1 AND oauth!=true;";
  const values = [info.email];

  client.query(sql, values, async (err, result) => {
    if (err) {
      res.status(400).send('Something went wrong.');
    } else if (!result.rows.length) {
      sql = "SELECT id FROM Users WHERE email=$1 AND oauth=true;";
      client.query(sql, values, (err, result) => {
        if (err) {
          res.status(400).send('Something went wrong.');
        } else if (!result.rows.length) {
          res.status(404).send('This email is not associated with an account.');
        } else {
          res.status(422).send('This account was created via Facebook.');
        }
      });
    } else {
      const id = result.rows[0]['id'];
      var token = await createPasswordResetToken(id);

      if (token === -1) {
        res.status(400).send('Something went wrong.');
      } else {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: `${process.env.EMAIL_ADDRESS}`,
            pass: `${process.env.EMAIL_PASSWORD}`
          }
        });

        const mailOptions = {
          from: `${process.env.EMAIL_ADDRESS}`,
          to: `${info.email}`,
          subject: '[InstructED] Reset Password Link',
          text:
          'You are receiving this email because you (or someone else) have requested a password reset for your InstructED account.\n\n'
          + `Please click on the following link, or paste this into your browser to complete the process within ${resetExpirationAmount} ${resetExpirationUnit} of receiving it:\n\n`
          + `http://instructed.herokuapp.com/resetPassword/${token}\n\n`
          + 'If you did not make this request, please ignore this email and your credentials will remain unchanged.\n'
        }

        transporter.sendMail(mailOptions, (error, response) => {
          if (error) {
            res.status(500).send('Something went wrong with sending the email.');
          } else {
            res.status(200).send('Recovery email sent.');
          }
        });
      }
    }
  });
});

const createPasswordResetToken = async (id) => {
  const token = crypto({length: 40, type: 'url-safe'});
  const expiration = moment(Date.now()).add(resetExpirationAmount, resetExpirationUnit).format('YYYY-MM-DD HH:mm:ss');

  let sql = "INSERT INTO PasswordTokens VALUES($1, $2, $3)";
  const values = [id, token, expiration];

  const result = await client.query(sql, values)
    .then(result => {
      return token;
    })
    .catch(async (err) => {
      sql = 'UPDATE PasswordTokens SET token=$2, expiration=$3 WHERE id=$1;';
      return await client.query(sql, values)
        .then(result => {
          return token;
        })
        .catch(err => {
          return -1;
        });
    });

  return result;
};

const resetPassword = async (req, res, next) => {
  const token = req.params.token;

  const expirationCode = await checkResetExpiration(token);
  res.status(expirationCode);
  next();
};

const checkResetExpiration = async (token) => {
  const sql = 'SELECT expiration FROM PasswordTokens WHERE token=$1;';
  const values = [token];

  return await client.query(sql, values)
    .then(result => {
      if (!result.rows.length) {
        return 401;
      } else {
        const row = result.rows[0];
        const expiration = moment(row['expiration']).utc();
        const now = moment(Date.now()).utc();

        if (now.isAfter(expiration)) {
          return 408;
        } else {
          return 200;
        }
      }
    }).catch(err => {
      return 400;
    });
};

const updatePassword = async (req, res) => {
  const token = req.body.token;
  const password = req.body.password;

  const expirationCode = await checkResetExpiration(token);

  if (expirationCode === 200) {
    let sql = 'SELECT id FROM PasswordTokens WHERE token=$1;';
    let values = [token];

    client.query(sql, values, (err, result) => {
      if (err) {
        res.status(400).send('Something went wrong.');
      } else {
        if (!result.rows.length) {
          res.status(401).send();
        } else {
          const id = result.rows[0]['id'];
          sql = "UPDATE Users SET password=crypt($1, gen_salt('bf')) WHERE id=$2;";
          values = [password, id];

          client.query(sql, values, (err, result) => {
            if (err) {
              res.status(400).send('Something went wrong.');
            } else {
              res.status(201).send();
            }
          });
        }
      }
    });
  } else {
    res.status(expirationCode).send();
  }
};


const getRole = (req, res) => {
  const id = req.userID;

  const sql = 'SELECT main_role FROM Users WHERE id=$1;';
  const values = [id];

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send('Something went wrong.');
    } else {
      if (!result.rows.length) {
        res.status(400).send('Something went wrong.');
      } else {
        res.status(200).send(result.rows[0]['main_role']);
      }
    }
  });
}

const setRole = (req, res) => {
  const info = req.body;
  const sql = 'UPDATE Users SET main_role=$1 WHERE id=$2;'
  const values = [info.role, info.userID];

  client.query(sql, values, (err) => {
    if (err) {
      res.status(400).send('User ID does not exist.');
    } else {
      res.status(200).send('Role set successfully.');
    }
  });
}
/**
 * Courses, Assignments, and Announcements
 */

const getAllCourses = (role) => (req, res) => {
  let filter;
  let values;
  switch (role) {
    case 'student':
      filter = ' INNER JOIN Enrollments on Courses.course_id=Enrollments.course_id WHERE Enrollments.user_id=$1;';
      values = [req.userID];
      break;
    case 'instructor':
      filter = ' INNER JOIN Instructing on Courses.course_id=Instructing.course_id WHERE Instructing.user_id=$1;';
      values = [req.userID];
      break;
    case 'admin':
      filter = '';
      values = [];
      break;
    default: 
      throw new Error('Invalid role.')
  }

  const sql = `SELECT * FROM Courses${filter};`;

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send('Something went wrong.');
    } else {
      res.status(200).send(result.rows);
    }
  });
}

const getAllAnnouncements = (role) => (req, res) => {
  let filter;
  let values;
  switch (role) {
    case 'student':
      filter = ' INNER JOIN Enrollments on AC.course_id=Enrollments.course_id WHERE Enrollments.user_id=$1;';
      values = [req.userID];
      break;
    case 'instructor':
      filter = ' INNER JOIN Instructing on AC.course_id=Instructing.course_id WHERE Instructing.user_id=$1;';
      values = [req.userID];
      break;
    case 'admin':
      filter = '';
      values = [];
      break;
    default: 
      throw new Error('Invalid role.')
  }
  
  const sql = `SELECT * FROM
    (SELECT Announcements.*, Courses.course_name FROM
      Announcements INNER JOIN Courses
      ON Announcements.course_id=Courses.course_id)
    AS AC${filter};`

  client.query(sql, values, (err, result) => {
    if(err) {
      res.status(400).send('Something went wrong.');
    } else {
      res.status(200).send(result.rows);
    }
  })
}

const getAllAssignments = (role) => (req, res) => {
  let filter;
  switch (role) {
    case 'student':
      filter = ' INNER JOIN Enrollments on AC.course_id=Enrollments.course_id WHERE Enrollments.user_id=$1;';
      break;
    case 'instructor':
      filter = ' INNER JOIN Instructing on AC.course_id=Instructing.course_id WHERE Instructing.user_id=$1;';
      break;
    case 'admin':
      filter = '';
      break;
    default:
      throw new Error('Invalid role.')
  }

  const sql = `SELECT * FROM
  (SELECT Assignments.*, CONCAT(Courses.course_dept, ' ', Courses.course_number) as course_name FROM
    Assignments INNER JOIN Courses
    ON Assignments.course_id=Courses.course_id)
   AS AC${filter};`;
  const values = [req.userID];

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send('Something went wrong.');
    } else {
      res.status(200).send(result.rows);
    }
  });
}

const getAssignment = (req, res) => {
  let assignmentID = req.params.ID;
  const userID = req.userID;

  if (!isNaN(assignmentID)) {
    assignmentID = parseInt(assignmentID);
    if (userCanAccessAssignment(userID, assignmentID)) {
      const sql = `SELECT * FROM Assignments WHERE assignment_id=$1`;
      const values = [assignmentID];
      client.query(sql, values, (err, result) => {
        if (err) {
          res.status(400).send('Something went wrong.');
        } else if (!result.rows.length) {
          res.status(404).send('Assignment not found.');
        } else {
          res.status(200).send(results.rows[0]);
        }
      })
    } else {
      res.status(403).send('Access denied.')
    }
  } else {
    res.status(404).send('Assignment not found.');
  }
}

/**
 * Checks that a user with a given userID can view the provided assignment ID.
 * @param {uuid} userID 
 * @param {integer} assignmentID 
 * @return {boolean} True if the user can access the assignment, false otherwise.
 */
const userCanAccessAssignment = (userID, assignmentID) => {
  // First check if user is an admin.
  const role = queryForRole(userID);
  if (role == 'admin') {
    return true;
  } else {
    // Check instructors table first to see if the user is associated with the course.
    let tables = ['Instructing', 'Enrollments'];
    const values = [userID, assignmentID];

    for (let i = 0; i < tables.length; i++) {
      const sql = `SELECT * FROM
      (SELECT assignment_id, course_id FROM
        Assignments WHERE
        assignment_id=$2) AS A
      INNER JOIN ${tables[i]}
      ON A.course_id=${tables[i]}.course_ID
      WHERE
      ${tables[i]}.user_id=$1;`;

      let found = client.query(sql, values, (err, result) => {
        if (err || !result.rows.length) {
          return false;
        } else {
          return true;
        }
      });

      if (found) {
        return true;
      }
    }
  }
}

/**
 * Gets the role of the user with the given userID.
 * @param {Integer} userID 
 * @return {String} The role of the user.
 */
const queryForRole = (userID) => {
  const sql = 'SELECT main_role FROM Users WHERE id=$1;';
  const values = [userID];

  client.query(sql, values, (err, result) => {
    if (err) {
      return '';
    } else {
      if (!result.rows.length) {
        return '';
      } else {
        return result.rows[0]['main_role'];
      }
    }
  });
}

const getCourseAnnouncements = (req, res) => {
  const sql = `SELECT Announcements.*, U.first_name, U.last_name FROM
  Announcements
  INNER JOIN
  (SELECT id, first_name, last_name FROM Users) as U
  ON Announcements.author_id=U.id
  WHERE Announcements.course_id=$1;`
  const values = [req.params.ID];

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send('Something went wrong.');
    } else {
      res.status(200).send(result.rows);
    }
  });
}

const getCourseAssignments = (req, res) => {
  const sql = 'SELECT * FROM Assignments WHERE Assignments.course_id=$1;'
  const values = [req.params.ID];

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send('Something went wrong.');
    } else {
      res.status(200).send(result.rows);
    }
  });
}

const addAnnouncement = (req, res) => {
  const info = req.body;
  const userID = req.userID;
  const creationDate = moment(Date.now()).format('YYYY-MM-DD HH:mm:ss');
  const sql = `INSERT INTO Announcements VALUES
    (default, $1, $2, $3, $4, $5);`;
  const values = [info.announcementName, info.description, info.courseID, creationDate, userID];

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send('Something went wrong.');
    } else {
      res.status(201).send('Announcement successfully created.');
    }
  });
}

const getAssignmentsByDate = (req, res) => {
  const date = moment(req.params.date).format('YYYY-MM-DD HH:mm:ss');
  const userID = req.userID;
  const sql = `SELECT * FROM
    Assignments WHERE
    course_id IN
    ((SELECT course_id FROM Instructing
        WHERE user_id=$1)
        UNION
      (SELECT course_id from Enrollments
        WHERE user_id=$1))
    AND
    deadline >= $2
    AND
    deadline <= ($2 + INTERVAL '1' DAY);`;
  const values = [userID, date];

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send('Something went wrong.');
    } else {
      res.status(200).send(result.rows);
    }
  });
}

const getUpcomingAssignments = (req, res) => {
  const date = moment(req.params.date).format('YYYY-MM-DD HH:mm:ss');
  const userID = req.userID;
  const sql = `SELECT * FROM
    Assignments WHERE
    course_id IN
    ((SELECT course_id FROM Instructing
        WHERE user_id=$1)
        UNION
      (SELECT course_id from Enrollments
        WHERE user_id=$1))
    AND
    deadline >= $2;`;
  const values = [userID, date];

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send('Something went wrong.');
    } else {
      res.status(200).send(result.rows);
    }
  });
}

const getCourse = (req, res) => {
  const courseID = req.params.ID;
  const sql = `WITH Course AS (
    SELECT Courses.*, CONCAT(I.first_name, ' ', I.last_name) as Instructor FROM
    (SELECT Instructing.course_id, Users.first_name, Users.last_name
      FROM Instructing INNER JOIN Users
      ON Instructing.user_id=Users.id
    ) AS I
    RIGHT OUTER JOIN
    Courses
    ON I.course_id=Courses.course_id
    WHERE Courses.course_id=$1)
    SELECT course_id, course_name, term, ARRAY_AGG(Instructor) Instructors
    FROM Course
    GROUP BY course_id, course_name, term;`;
  const values = [courseID];

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send('Something went wrong.');
    } else {
      res.status(200).send(result.rows[0]);
    }
  });
}

const addCourse = (req, res) => {
  const info = req.body;
  let sql = `INSERT INTO Courses VALUES
    (default, $1, $2, $3, $4) RETURNING course_id;`;
  let values = [info.courseDept, info.courseNumber, info.courseName, info.courseTerm];

  client.query(sql, values, (err, result) => {
    if (err) {
      console.log(err);
      res.status(400).send('Something went wrong with adding the course.');
    } else {
      const course_id = result.rows[0].course_id;
      sql = `INSERT INTO Instructing VALUES
        ($1, $2);`;
      values = [info.instructorID, course_id]; 
      
      client.query(sql, values, (err, result) => {
        if (err) {
          res.status(400).send('Something went wrong with adding the instructor to the course.');
        } else {
          res.status(201).send('Course and instructor added.');
        }
      });
    }
  });
}

const addInstructorToCourse = (req, res) => {
  const info = req.body;
  const sql = 'INSERT INTO Instructing VALUES ($1, $2);';
  const values = [info.userID, info.courseID];

  client.query(sql, values, (err) => {
    if (err) {
      if (err.constraint.includes('course')) {
        res.status(400).send('Course ID does not exist.');
      } else if (err.constraint.includes('user')) {
        res.status(400).send('User ID does not exist.');
      } else {
        res.status(400).send('Something went wrong.');
      }
    } else {
      res.status(201).send('Instructor added to the course.');
    }
  });
}

const addStudentToCourse = (req, res) => {
  const info = req.body;
  const sql = 'INSERT INTO Enrollments VALUES ($1, $2);';
  const values = [info.userID, info.courseID];

  client.query(sql, values, (err) => {
    if (err) {
      if (err.constraint.includes('course')) {
        res.status(400).send('Course ID does not exist.');
      } else if (err.constraint.includes('user')) {
        res.status(400).send('User ID does not exist.');
      } else {
        res.status(400).send('Something went wrong.');
      }
    } else {
      res.status(201).send('Student added to the course.');
    }
  });
}

const addSubmission = (req, res) => {
  // First, we insert into the database a new submission
  // We can get the assignment_id from req.body. User_ID is stored
  // in req.userID. We want the insert request to return the new
  // submission ID (see RETURNING sql)
  // Once we have the submission ID (that's our folder to store the uploaded files),
  // We make an upload request to the AWS services to the specified directory
  const userID = req.userID;
  const form = new multiparty.Form();
  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(400).send(err);
    } else {
      const origName = files.file[0].originalFilename;
      const path = files.file[0].path;
      const buffer = fs.readFileSync(path);
      const assignmentID = fields.assignmentID[0];
      const timeSubmitted = moment(Date.now()).format('YYYY-MM-DD HH:mm:ss');
      let sql = "INSERT INTO Submissions VALUES (default, $1, $2, $3, null) RETURNING submission_id;";
      let values = [assignmentID, userID, timeSubmitted];

      client.query(sql, values, async (err, result) => {
        if (err) {
          console.log(err);
          res.status(400).send(err);
        } else {
          const submission_id = result.rows[0].submission_id;
          const fileName = `submissions/${submission_id}/${origName}`;
          const data = await uploadFile(buffer, fileName);
          res.status(201).send(data);
        }
      });
    }
  });
 
}

const addLinkSubmission = (req, res) => {
  const userID = req.userID;
  const assignmentID = req.body.assignmentID;
  const link = req.body.link;
  const timeSubmitted = moment(Date.now()).format('YYYY-MM-DD HH:mm:ss');
  let sql = "INSERT INTO Submissions VALUES (default, $1, $2, $3, $4) RETURNING submission_id;";
  let values = [assignmentID, userID, timeSubmitted, link];
 
  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send();
    } else {
      res.status(201).send();
    }
  });
}

const addCourseVideo = (req, res) => {
  const form = new multiparty.Form();
  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(400).send(err);
    } else {
      const origName = files.file[0].originalFilename;
      const path = files.file[0].path;
      const courseID = fields.courseID[0];
      const buffer = fs.readFileSync(path);
      const fileName = `courses/${courseID}/videos/${origName}`;

      const uploadDate = moment(Date.now()).format('YYYY-MM-DD HH:mm:ss');
      const sql = "INSERT INTO CourseVideos VALUES ($1, $2, $3, false);";
      const values = [courseID, origName, uploadDate];

      client.query(sql, values, async (err2, result) => {
        if (err2) {
          res.status(400).send(err);
        } else {
          try {
            const data = await uploadFile(buffer, fileName);
            res.status(201).send(data);
          } catch (err3) {
            console.log(err3);
            res.status(400).send(err3);
          }
        }
      });
    }
  });
};

const getApprovedCourseVideos = (req, res) => {
  const courseID = req.params.courseID;

  const sql = "SELECT * FROM CourseVideos WHERE $1='' OR course_id=$1 and approved;"
  const values = [courseID];

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send(err);
    } else {
      const rows = result.rows;
      const data = []; 

      for (const row of rows) {
        let params = {
          Bucket: "instructed",
          Key: `courses/${courseID}/videos/${row.file_name}`
        };

        let url = s3.getSignedUrl('getObject', params);
        data.push({file_name: row.file_name, url: url});
      }

      res.status(200).send(data);
    }
  });
}

const getCourseVideos = (req, res) => {
  const courseID = req.params.courseID;

  const sql = "SELECT * FROM CourseVideos WHERE $1='' OR course_id=$1;"
  const values = [courseID];

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send(err);
    } else {
      const rows = result.rows;
      const data = []; 

      for (const row of rows) {
        let params = {
          Bucket: "instructed",
          Key: `courses/${courseID}/videos/${row.file_name}`
        };

        let url = s3.getSignedUrl('getObject', params);
        data.push({file_name: row.file_name, url: url});
      }

      res.status(200).send(data);
    }
  });
}

const getUnapprovedCourseVideos = (req, res) => {
  const courseID = req.params.courseID;

  const sql = "SELECT * FROM CourseVideos WHERE $1='' OR course_id=$1 and not approved;"
  const values = [courseID];

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send(err);
    } else {
      const rows = result.rows;
      const data = []; 

      for (const row of rows) {
        let params = {
          Bucket: "instructed",
          Key: `courses/${courseID}/videos/${row.file_name}`
        };

        let url = s3.getSignedUrl('getObject', params);
        data.push({file_name: row.file_name, url: url});
      }

      res.status(200).send(data);
    }
  });
}

const addAssignmentFile = (req, res) => {
  const form = new multiparty.Form();
  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(400).send(err);
    } else {
      const origName = files.file[0].originalFilename;
      const path = files.file[0].path;
      const assignmentID = fields.assignmentID[0];
      const buffer = fs.readFileSync(path);
      const fileName = `assignments/${assignmentID}/${origName}`;

      const uploadDate = moment(Date.now()).format('YYYY-MM-DD HH:mm:ss');
      const sql = "INSERT INTO AssignmentFiles VALUES ($1, $2, $3, false);";
      const values = [assignmentID, origName, uploadDate];

      client.query(sql, values, async (err2, result) => {
        if (err2) {
          res.status(400).send(err);
        } else {
          try {
            const data = await uploadFile(buffer, fileName);
            res.status(201).send(data);
          } catch (err3) {
            console.log(err3);
            res.status(400).send(err3);
          }
        }
      });
    }
  });
};

const getApprovedAssignmentFiles = (req, res) => {
  const assignmentID = req.params.assignmentID;

  const sql = "SELECT * FROM AssignmentFiles WHERE $1='' OR assignment_id=$1 and approved;"
  const values = [assignmentID];

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send(err);
    } else {
      const rows = result.rows;
      const data = []; 

      for (const row of rows) {
        let params = {
          Bucket: "instructed",
          Key: `assignments/${assignmentID}/${row.file_name}`
        };

        let url = s3.getSignedUrl('getObject', params);
        data.push({file_name: row.file_name, url: url});
      }

      res.status(200).send(data);
    }
  });
}

const getAssignmentFiles = (req, res) => {
  const assignmentID = req.params.assignmentID;

  const sql = "SELECT * FROM AssignmentFiles WHERE $1='' OR assignment_id=$1;"
  const values = [assignmentID];

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send(err);
    } else {
      const rows = result.rows;
      const data = []; 

      for (const row of rows) {
        let params = {
          Bucket: "instructed",
          Key: `assignments/${assignmentID}/${row.file_name}`
        };

        let url = s3.getSignedUrl('getObject', params);
        data.push({file_name: row.file_name, url: url});
      }

      res.status(200).send(data);
    }
  });
}

const getUnapprovedAssignmentFiles = (req, res) => {
  const assignmentID = req.params.assignmentID;

  const sql = "SELECT * FROM AssignmentFiles WHERE $1='' OR assignment_id=$1 and not approved;"
  const values = [assignmentID];

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send(err);
    } else {
      const rows = result.rows;
      const data = []; 

      for (const row of rows) {
        let params = {
          Bucket: "instructed",
          Key: `assignments/${assignmentID}/${row.file_name}`
        };

        let url = s3.getSignedUrl('getObject', params);
        data.push({file_name: row.file_name, url: url});
      }

      res.status(200).send(data);
    }
  });
}

const addCourseFile = (req, res) => {
  const form = new multiparty.Form();
  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(400).send(err);
    } else {
      const origName = files.file[0].originalFilename;
      const path = files.file[0].path;
      const courseID = fields.courseID[0];
      const buffer = fs.readFileSync(path);
      const fileName = `courses/${courseID}/files/${origName}`;

      const uploadDate = moment(Date.now()).format('YYYY-MM-DD HH:mm:ss');
      const sql = "INSERT INTO CourseFiles VALUES ($1, $2, $3, false);";
      const values = [courseID, origName, uploadDate];

      client.query(sql, values, async (err2, result) => {
        if (err2) {
          res.status(400).send(err);
        } else {
          try {
            const data = await uploadFile(buffer, fileName);
            res.status(201).send(data);
          } catch (err3) {
            console.log(err3);
            res.status(400).send(err3);
          }
        }
      });
    }
  });
};

const getApprovedCourseFiles = (req, res) => {
  const courseID = req.params.courseID;

  const sql = "SELECT * FROM CourseFiles WHERE $1='' OR course_id=$1 and approved;"
  const values = [courseID];

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send(err);
    } else {
      const rows = result.rows;
      const data = []; 

      for (const row of rows) {
        let params = {
          Bucket: "instructed",
          Key: `courses/${courseID}/files/${row.file_name}`
        };

        let url = s3.getSignedUrl('getObject', params);
        data.push({file_name: row.file_name, url: url});
      }

      res.status(200).send(data);
    }
  });
}

const getCourseFiles = (req, res) => {
  const courseID = req.params.courseID;

  const sql = "SELECT * FROM CourseFiles WHERE $1='' OR course_id=$1;"
  const values = [courseID];

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send(err);
    } else {
      const rows = result.rows;
      const data = []; 

      for (const row of rows) {
        let params = {
          Bucket: "instructed",
          Key: `courses/${courseID}/files/${row.file_name}`
        };

        let url = s3.getSignedUrl('getObject', params);
        data.push({file_name: row.file_name, url: url});
      }

      res.status(200).send(data);
    }
  });
}

const getUnapprovedCourseFiles = (req, res) => {
  const courseID = req.params.courseID;
  console.log(courseID);
  const sql = "SELECT * FROM CourseFiles WHERE $1='' OR course_id=$1 and not approved;"
  const values = [courseID];

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send(err);
    } else {
      const rows = result.rows;
      const data = []; 

      for (const row of rows) {
        let params = {
          Bucket: "instructed",
          Key: `courses/${courseID}/files/${row.file_name}`
        };

        let url = s3.getSignedUrl('getObject', params);
        data.push({file_name: row.file_name, url: url});
      }

      res.status(200).send(data);
    }
  });
}

const getCourseStudents = (req, res) => {
  const courseID = req.params.courseID;

  const sql = `SELECT Users.id, Users.first_name, Users.last_name
   FROM Enrollments INNER JOIN Users ON Enrollments.user_id=Users.id WHERE Enrollments.course_id=$1;`;
  const values = [courseID];

  client.query(sql, values, (err, result) => {
    if (err) {
      console.log(err);
      res.status(400).send(err);
    } else {
      res.status(200).send(result.rows);
    }
  });
}

const getGrade = (req, res) => {
  const userID = req.userID;
  const assignmentID = req.params.assignmentID;
  const values = [userID, assignmentID];
  const sql = 'SELECT grade FROM Grades WHERE user_id=$1 AND assignment_id=$2;';

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send(err);
    } else {
      res.status(200).send(result.rows);
    }
  })
}

const getStudentGrade = (req, res) => {
  const userID = req.params.userID;
  const assignmentID = req.params.assignmentID;
  const values = [userID, assignmentID];
  const sql = 'SELECT grade FROM Grades WHERE user_id=$1 AND assignment_id=$2;';

  client.query(sql, values, (err, result) => {
    if (err) {
      res.status(400).send(err);
    } else {
      res.status(200).send(result.rows);
    }
  })
}

const addGrade = (req, res) => {
const userID = req.body.userID;
  const assignmentID = req.body.assignmentID;
  const grade = req.body.grade;
  const values = [assignmentID, userID, grade];
  const sql = 'INSERT INTO Grades VALUES ($1, $2, $3);';

  client.query(sql, values, (err) => {
    if (err) {
      if (err.constraint.includes('assignment')) {
        res.status(400).send('Assignment ID does not exist.');
      } else if (err.constraint.includes('user')) {
        res.status(400).send('User ID does not exist.');
      } else {
        res.status(400).send('Something went wrong.');
      }
    } else {
      res.status(201).send('Grade added.');
    }
  });
}

const getAssignmentSubmissions = (req, res) => {
  const assignmentID = req.params.assignmentID;
  let userID;
  console.log(req.params);
  if (req.params.studentID) {  //userID
    userID = req.params.studentID; //userID
  } else {
    userID = req.userID;
  }

  let sql = `SELECT * FROM Submissions WHERE user_id=$1 AND assignment_id=$2 AND link IS NULL;`;
  const values = [userID, assignmentID];
  const data = [];

  client.query(sql, values, async (err, result) => {
    if (err) {
      console.log(err);
      res.status(400).send(err);
    } else {
      const rows = result.rows;

      for (const row of rows) {
        let params = {
          Bucket: "instructed",
          Prefix: `submissions/${row.submission_id}/`
        };

        await s3.listObjects(params, (err, files) => {
          if (!err) {
            for (const file of files.Contents) {
              let p = {
                Bucket: "instructed",
                Key: file.Key
              }
              let url = s3.getSignedUrl('getObject', p);
              let regex = /\/[^\/]+\..+/g
              let filename = file.Key.match(regex)[0].substring(1);
              let objectData = {file_name: filename, url: url, time_submitted: row.time_submitted};
              // Not the greatest, but not sure why I'm getting duplicates.
              let contains = false;
              for (let i = 0; i < data.length; i++) {
                if (data[i].filename == objectData.filename) {
                  contains = true;
                  break;
                }
              }

              if (!contains) {
                data.push(objectData);
              }
            }
          }
        }).promise();
      }

      sql = `SELECT * FROM Submissions WHERE user_id=$1 AND assignment_id=$2 AND link IS NOT NULL;`;
      client.query(sql, values, (err, result) => {
        if (err) {
          res.status(400).send(err);
        } else {
          const rows = result.rows;

          for (const row of rows) {
            data.push({file_name: row.link, url: row.link, time_submitted: row.time_submitted});
          }

          res.status(200).send(data);
        }
      });

    }
  });
}

const getRoleInCourse = (req, res) => {
  const userID = req.userID;
  const courseID = req.params.courseID;
  let sql = `SELECT FROM Instructing WHERE user_id=$1 and course_id=$2;`;
  let values = [userID, courseID];

  client.query(sql, values, (err, result) => {
    if (err) {
      console.log(err);
      res.status(400).send(err);
    } else {
      if (result.rows.length) {
        res.status(200).send('instructor');
      } else {
        res.status(200).send('student');
      }
    }
  });
}

const addAssignment = (req, res) => {
  const info = req.body;
  console.log(info);
  const date = moment(info.date).format('YYYY-MM-DD HH:mm:ss');
  const name = info.assignmentName;
  const desc = info.description;
  const courseID = info.courseID;

  const sql = `INSERT INTO Assignments VALUES (default, $1, $2, $3, $4, '{}');`
  const values = [name, desc, courseID, date];

  client.query(sql, values, (err, result) => {
    if (err) {
      console.log(err);
      res.status(400).send(err);
    } else {
      res.status(201).send('Assignment added.');
    }
  });
}

const approveCourseFile = (req, res) => {
  const info = req.body;
  const courseID = info.courseID;
  const fileName = info.fileName;
  const isApproved = info.isApproved;

  const sql = `UPDATE CourseFiles SET approved=$1 WHERE course_id=$2 AND file_name=$3;`;
  const values = [isApproved, courseID, fileName];

  client.query(sql, values, (err, result) => {
    if (err) {
      console.log(err);
      res.status(400).send(err);
    } else {
      res.status(200).send();
    }
  });
}

const approveCourseVideo = (req, res) => {
  const info = req.body;
  const courseID = info.courseID;
  const fileName = info.fileName;
  const isApproved = info.isApproved;

  const sql = `UPDATE CourseVideos SET approved=$1 WHERE course_id=$2 AND file_name=$3;`;
  const values = [isApproved, courseID, fileName];

  client.query(sql, values, (err, result) => {
    if (err) {
      console.log(err);
      res.status(400).send(err);
    } else {
      res.status(200).send();
    }
  });
}

const approveAssignmentFile = (req, res) => {
  const info = req.body;
  const assignmentID = info.assignmentID;
  const fileName = info.fileName;
  const isApproved = info.isApproved;

  const sql = `UPDATE AssignmentFiles SET approved=$1 WHERE assignment_id=$2 AND file_name=$3;`;
  const values = [isApproved, assignmentID, fileName];

  client.query(sql, values, (err, result) => {
    if (err) {
      console.log(err);
      res.status(400).send(err);
    } else {
      res.status(200).send();
    }
  });
}

const searchUsers = (req, res) => {
  let query = req.params.query;
  query = `%${query}%`;
  const role = req.params.role.toLowerCase();
  const sql = `SELECT id, main_role, first_name, last_name, email FROM Users WHERE (CONCAT(first_name, ' ', last_name) ILIKE $1 OR email ILIKE $1) ${role != 'any' ? 'AND main_role=$2' : 'AND $2=$2'};`;
  const values = [query, role];

  client.query(sql, values, (err, result) => {
    if (err) {
      console.log(err);
      res.status(400).send(err);
    } else {
      res.status(200).send(result.rows);
    }
  });
}

const searchCourses = (req, res) => {
  let query = req.params.query;
  query = `%${query}%`;
  const sql = `SELECT * FROM Courses WHERE course_name ILIKE $1;`;
  const values = [query];

  client.query(sql, values, (err, result) => {
    if (err) {
      console.log(err);
      res.status(400).send(err);
    } else {
      res.status(200).send(result.rows);
    }
  });
}


module.exports = {
  createUser,
  loginUser,
  loginFacebook,
  forgotPassword,
  resetPassword,
  updatePassword,
  getRole,
  setRole,
  getRoleInCourse,
  getAllCourses,
  getAllAnnouncements,
  getAllAssignments,
  getCourseAssignments,
  getCourseAnnouncements,
  getAssignmentsByDate,
  getUpcomingAssignments,
  getAssignment,
  addAssignment,
  getCourse,
  addCourse,
  addInstructorToCourse,
  addStudentToCourse,
  addAnnouncement,
  addSubmission,
  addLinkSubmission,
  addAssignmentFile,
  addCourseVideo,
  getCourseVideos,
  getApprovedCourseVideos,
  getUnapprovedCourseVideos,
  addCourseFile,
  getCourseFiles,
  getApprovedCourseFiles,
  getUnapprovedCourseFiles,
  getCourseStudents,
  getAssignmentSubmissions,
  getAssignmentFiles,
  getApprovedAssignmentFiles,
  getUnapprovedAssignmentFiles,
  getStudentGrade,
  getGrade,
  addGrade,
  approveAssignmentFile,
  approveCourseFile,
  approveCourseVideo,
  searchUsers,
  searchCourses
};
