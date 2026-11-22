document.addEventListener('DOMContentLoaded', async () => {
  const titleInput = document.getElementById('title');
  const employerInput = document.getElementById('employer');
  const locationInput = document.getElementById('location');
  const urlInput = document.getElementById('url');
  const clipBtn = document.getElementById('clip-btn');
  const statusDiv = document.getElementById('status');

  // Query active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url) {
    urlInput.value = tab.url;

    // Detect source
    let source = 'web';
    if (tab.url.includes('linkedin.com')) source = 'linkedin';
    else if (tab.url.includes('myworkdayjobs.com') || tab.url.includes('workday.com')) source = 'workday';
    else if (tab.url.includes('naukri.com')) source = 'naukri';

    // Inject extraction script into current page
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractJobDetailsFromPage,
      });
      const data = results?.[0]?.result;
      if (data) {
        if (data.title) titleInput.value = data.title;
        if (data.employer) employerInput.value = data.employer;
        if (data.location) locationInput.value = data.location;
      }
    } catch {
      // In case scripting is restricted on special pages
    }

    clipBtn.addEventListener('click', () => {
      const title = titleInput.value.trim();
      const employer = employerInput.value.trim();
      const location = locationInput.value.trim();
      const url = urlInput.value.trim();

      if (!title || !employer) {
        statusDiv.className = 'error';
        statusDiv.textContent = 'Role title and employer are required.';
        return;
      }

      clipBtn.disabled = true;
      statusDiv.className = '';
      statusDiv.textContent = 'Sending to local Career Strike…';

      chrome.runtime.sendNativeMessage(
        'com.careerstrike.clipper',
        {
          action: 'clip',
          job: {
            title,
            employer,
            location,
            url,
            source,
          },
        },
        (response) => {
          clipBtn.disabled = false;
          if (chrome.runtime.lastError) {
            statusDiv.className = 'error';
            statusDiv.textContent = 'Native bridge error: ' + chrome.runtime.lastError.message;
            return;
          }
          if (response && response.ok) {
            statusDiv.className = 'success';
            statusDiv.textContent = response.message || 'Clipped successfully!';
            setTimeout(() => window.close(), 1200);
          } else {
            statusDiv.className = 'error';
            statusDiv.textContent = response?.error || 'Failed to clip job.';
          }
        },
      );
    });
  }
});

function extractJobDetailsFromPage() {
  const url = window.location.href;
  let title = '';
  let employer = '';
  let location = '';

  if (url.includes('linkedin.com')) {
    title =
      document.querySelector('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1')
        ?.textContent?.trim() || '';
    employer =
      document.querySelector(
        '.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name',
      )?.textContent?.trim() || '';
    location =
      document.querySelector(
        '.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet',
      )?.textContent?.trim() || '';
  } else if (url.includes('workday')) {
    title = document.querySelector('[data-automation-id="jobPostingHeader"], h2')?.textContent?.trim() || '';
    employer = document.querySelector('[data-automation-id="companyName"]')?.textContent?.trim() || '';
    location = document.querySelector('[data-automation-id="locations"]')?.textContent?.trim() || '';
  } else if (url.includes('naukri.com')) {
    title = document.querySelector('.jd-header-title, h1')?.textContent?.trim() || '';
    employer = document.querySelector('.jd-header-comp-name a, .comp-name')?.textContent?.trim() || '';
    location = document.querySelector('.location, .loc')?.textContent?.trim() || '';
  } else {
    // Generic heuristic
    const h1 = document.querySelector('h1');
    if (h1) title = h1.textContent?.trim() || '';
  }

  return { title, employer, location };
}
