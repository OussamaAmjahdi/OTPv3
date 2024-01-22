  const express = require('express');
  const Imap = require('imap');
  const simpleParser = require('mailparser').simpleParser;
  const Promise = require('bluebird');

  const app = express();
  const port = 3000;

  Promise.longStackTraces();

  app.get('/GetOtpV3', (req, res) => {
    const { mail, password, host } = req.query;

    if (!mail || !password || !host) {
      return res.status(400).json({ error: 'Invalid parameters. Please provide mail, password, and host.' });
    }

    // Example: Dynamic IMAP configuration
    const dynamicImapConfig = {
      user: mail,
      password,
      host,
      port: 993,
      tls: true,
      tlsOptions: {
        rejectUnauthorized: false,
      },
    };

    // Fetch unseen emails from "growthtogether0@gmail.com"
    fetchUnseenEmails(dynamicImapConfig, 'Info@blsinternational.com')
      .then((unseenEmails) => {
        const regex = /\b(\d{6})\b/; // Matches a 6-digit number

        // Find the last unseen email with a 6-digit number
        let lastUnseenEmailWithSixDigit = null;
        for (let i = unseenEmails.length - 1; i >= 0; i--) {
          const email = unseenEmails[i];
          const match = email.content.match(regex);
          if (match) {
            lastUnseenEmailWithSixDigit = match[1]; // Extract the 6-digit code
            break;
          }
        }

        res.json({ code : lastUnseenEmailWithSixDigit });
      })
      .catch((err) => {
        res.status(500).json({ error: err.message });
      });
  });

  function fetchUnseenEmails(imapConfig, fromEmail) {
    const imap = new Imap(imapConfig);
    Promise.promisifyAll(imap);

    return new Promise((resolve, reject) => {
      imap.once('ready', function () {
        imap.openBox('INBOX', false, function (err, mailBox) {
          if (err) {
            imap.end();
            return reject({ error: 'Failed to open mailbox.', details: err.message });
          }

          // Search for unseen emails from the specified sender
          imap.search(['UNSEEN', ['FROM', fromEmail]], function (err, results) {
            if (err) {
              imap.end();
              return reject({ error: 'Failed to search for unseen emails.', details: err.message });
            }

            if (!results || results.length === 0) {
              // No unseen emails found
              imap.end();
              return resolve([{ error: 'No unseen messages to fetch.' }]);
            }

            const fetch = imap.fetch(results, { bodies: '', struct: true, markSeen: true });
            const unseenEmails = [];

            fetch.on('message', function (msg, seqno) {
              let emailData = {
                content: '',
              };

              // Parse the message structure
              msg.on('body', function (stream, info) {
                let buffer = '';

                // Collect the message body
                stream.on('data', function (chunk) {
                  buffer += chunk.toString('utf8');
                });

                stream.once('end', function () {
                  const parsePromise = simpleParser(buffer)
                    .then(parsedEmail => {
                      emailData.content = parsedEmail.text || '';
                      return emailData;
                    })
                    .catch(error => {
                      console.error('Error parsing email:', error);
                      return null;
                    });

                  unseenEmails.push(parsePromise);
                });
              });

              msg.once('attributes', function (attrs) {
                // You can access other attributes of the email here
              });
            });

            fetch.once('end', function () {
              console.log('Done fetching unseen messages.');
              imap.end();

              // Wait for all parsing promises to resolve
              Promise.all(unseenEmails)
                .then(parsedEmails => {
                  // Filter out any null values from parsing errors
                  resolve(parsedEmails.filter(email => email !== null));
                })
                .catch(error => {
                  reject({ error: 'Error parsing emails.', details: error.message });
                });
            });
          });
        });
      });

      imap.once('error', function (err) {
        imap.end();
        reject({ error: 'IMAP connection error.', details: err.message });
      });

      imap.connect();
    });
  }


  app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
  });
