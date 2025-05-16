const express = require('express');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const cors = require('cors');
const bodyParser = require('body-parser');
const os = require('os');

const app = express();
const PORT = 3000;

// Get local IP address
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const interfaceName in interfaces) {
    const iface = interfaces[interfaceName];
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIpAddress();

const allowedOrigins = [
    'http://localhost:3000',
    `http://${LOCAL_IP}:3000`
    // Explicitly list all allowed origins
  ];
  
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    optionsSuccessStatus: 200
  }));

app.use(bodyParser.json());
app.use(express.static('public'));

let activePort = null;

function validateVoucherCode(voucher) {
    // Strict validation including character set
    return /^[0-9]{14}$/.test(voucher) && 
           !/[<>"'\\]/.test(voucher) && // Prevent XSS
           !/\s/.test(voucher); // No whitespace
}
app.post('/api/recharge', async (req, res) => {
  const { voucher } = req.body;

  if (!validateVoucherCode(voucher)) {
    return res.status(400).json({ 
      success: false,
      error: 'Invalid voucher format. Must be 14 digits.',
      ussdCode: `*100*01*${voucher}#`
    });
  }

  const ussdCode = `*100*01*${voucher}#`;

  try {
    if (activePort) activePort.close();

    const port = new SerialPort({
      path: '/dev/ttyACM0',
      baudRate: 115200,
      autoOpen: false
    });

    activePort = port;
    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    let responseBuffer = '';
    let timeout;

    port.open(async (err) => {
      if (err) {
        return res.status(500).json({ 
          success: false,
          error: `Port error: ${err.message}`,
          ussdCode: ussdCode
        });
      }

      try {
        const sendCmd = async (cmd, wait = 300) => {
          return new Promise((resolve) => {
            port.write(`${cmd}\r\n`, (err) => {
              if (err) throw err;
              setTimeout(() => {
                const response = responseBuffer;
                responseBuffer = '';
                resolve(response);
              }, wait);
            });
          });
        };

        await sendCmd('ATE0');
        await sendCmd('AT');
        await sendCmd('AT+CUSD=1');

        const sanitizeUssdCode = (code) => {
            return code.replace(/[^0-9*#]/g, ''); // Only allow digits, *, and #
          };
          
        port.write(`AT+CUSD=1,"${sanitizeUssdCode(ussdCode)}",15\r\n`);
        
        timeout = setTimeout(() => {
          port.close();
          const regex = /\+CUSD: \d,"(.*?)"/;
          const match = responseBuffer.match(regex);
          
          if (match) {
            const modemResponse = match[1].trim();
            res.json({ 
              success: !modemResponse.includes('Invalid') && !modemResponse.includes('try again'),
              message: modemResponse,
              ussdCode: ussdCode,
              raw: responseBuffer.trim()
            });
          } else {
            res.json({ 
              success: false, 
              error: 'No valid response format',
              message: 'No response from network',
              ussdCode: ussdCode,
              raw: responseBuffer.trim()
            });
          }
        }, 5000);

      } catch (err) {
        clearTimeout(timeout);
        res.status(500).json({ 
          success: false,
          error: err.message,
          ussdCode: ussdCode
        });
      }
    });

    parser.on('data', (data) => {
      responseBuffer += data + '\n';
    });

    port.on('error', (err) => {
      clearTimeout(timeout);
      res.status(500).json({ 
        success: false,
        error: err.message,
        ussdCode: ussdCode
      });
    });

  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: err.message,
      ussdCode: ussdCode
    });
  }
});

// Start server on all network interfaces
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running:`);
  console.log(`- Local: http://localhost:${PORT}`);
  console.log(`- LAN: http://${LOCAL_IP}:${PORT}`);
});