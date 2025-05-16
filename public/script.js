document.addEventListener('DOMContentLoaded', () => {
    const rechargeForm = document.getElementById('recharge-form');
    const voucherInput = document.getElementById('voucher-code');
    const responseDiv = document.getElementById('response');
    const statusDiv = document.getElementById('status');
    const submitBtn = document.getElementById('submit-btn');
    const btnText = document.getElementById('btn-text');
    const btnLoading = document.getElementById('btn-loading');
    const digitCount = document.getElementById('digit-count');
    const digitCounter = document.querySelector('.digit-counter');
  
    // Dynamic server address detection
    const getServerAddress = () => {
      const hostname = window.location.hostname;
      // Development environment (host computer)
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '') {
        return 'localhost';
      }
      // Production/LAN access
      return hostname; // Use current hostname (works for both IP and domain)
    };

    const API_BASE_URL = `http://${getServerAddress()}:3000`;
  
    // Enhanced input handling
    const handleInput = (e) => {
      let value = e.target.value.replace(/\D+/g, '');
      value = value.slice(0, 14);
      e.target.value = value;
      
      const isValid = value.length === 14;
      digitCount.textContent = value.length;
      submitBtn.disabled = !isValid;
      
      // Visual feedback
      if (isValid) {
        digitCounter.classList.replace('error', 'success');
        voucherInput.classList.add('valid');
      } else {
        digitCounter.classList.replace('success', 'error');
        voucherInput.classList.remove('valid');
      }
    };

    // Set up event listeners
    voucherInput.addEventListener('input', handleInput);
    voucherInput.addEventListener('change', handleInput);
    voucherInput.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasteData = e.clipboardData.getData('text').replace(/\D+/g, '').slice(0, 14);
      voucherInput.value = pasteData;
      handleInput({ target: voucherInput });
    });

    // Form submission
    rechargeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const voucher = voucherInput.value;
      
      // UI updates
      responseDiv.innerHTML = '';
      statusDiv.textContent = 'Processing...';
      submitBtn.disabled = true;
      btnText.textContent = 'Processing...';
      btnLoading.style.display = 'inline-block';
      
      // Timeout handling
      const timeoutId = setTimeout(() => {
        responseDiv.innerHTML = `
          <div class="error-box">
            <h3>Timeout Error</h3>
            <div>Request took too long. Please try again.</div>
          </div>
        `;
        statusDiv.textContent = 'Error occurred';
        resetFormState();
      }, 15000);
      
      try {
        const response = await fetch(`${API_BASE_URL}/api/recharge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voucher }),
        });

        clearTimeout(timeoutId);
        const result = await response.json();
        
        // Display results
        const responseBox = document.createElement('div');
        responseBox.className = result.success ? 'response-box' : 'error-box';
        responseBox.innerHTML = `
          <h3>${result.success ? '✅ Success' : '❌ Failed'}</h3>
          <div class="response-content">${result.message || result.error || 'No response from network'}</div>
          <div class="ussd-code">USSD Code: ${result.ussdCode}</div>
        `;
        
        if (result.raw) {
          const details = document.createElement('details');
          details.innerHTML = `<summary>Technical Details</summary><pre>${result.raw}</pre>`;
          responseBox.appendChild(details);
        }
        
        responseDiv.appendChild(responseBox);
        statusDiv.textContent = result.success ? 'Completed' : 'Failed';
        responseBox.scrollIntoView({ behavior: 'smooth' });
        
      } catch (error) {
        clearTimeout(timeoutId);
        responseDiv.innerHTML = `
          <div class="error-box">
            <h3>Connection Error</h3>
            <div>${error.message || 'Network error occurred'}</div>
            ${navigator.onLine ? '' : '<div>You appear to be offline</div>'}
            <div>Server: ${API_BASE_URL}</div>
          </div>
        `;
        statusDiv.textContent = 'Error occurred';
      } finally {
        resetFormState();
      }
    });
  
    // Helper function
    const resetFormState = () => {
      submitBtn.disabled = voucherInput.value.length !== 14;
      btnText.textContent = 'Recharge Now';
      btnLoading.style.display = 'none';
    };

    // Initial setup
    voucherInput.value = '';
    digitCount.textContent = '0';
    digitCounter.classList.add('error');
    voucherInput.focus();
});