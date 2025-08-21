# Jobnick Chrome Extension

A powerful Chrome extension that revolutionizes LinkedIn job applications with AI-powered automation and smart job matching. The extension provides three main features to enhance your job search experience.

## 🚀 Main Features

### 1. 📋 Fill Job
**Automatically fill out job applications on LinkedIn**
- AI-powered form detection and field mapping
- Automatically fills all relevant fields with your profile data
- Two modes available:
  - **With Submission**: Automatically submits the application
  - **Without Submission**: Fills the form but lets you review before submitting
- **Recommendation**: Use "Without Submission" mode to review applications before sending

### 2. 📩 Message Recruiter
**Craft personalized messages to recruiters**
- Automatically detects job and company information from the current page
- Generates professional, personalized messages
- Language options available for international communication
- Helps you connect directly with hiring managers

### 3. 👥 Request Referral
**Request referrals via LinkedIn connections**
- Identifies potential connections at target companies
- Generates professional referral request messages
- Language options for international networking
- Increases your chances of getting noticed through employee referrals

## 🛠️ Getting Started

### Step 1: Install the Extension

#### Method 1: Load Unpacked Extension (Development)

1. **Download the extension files**
   - Clone or download this repository to your computer
   - Extract the files to a folder

2. **Open Chrome Extensions page**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)

3. **Load the extension**
   - Click "Load unpacked"
   - Select the folder containing the extension files
   - The extension should now appear in your extensions list

4. **Pin the extension**
   - Click the puzzle piece icon in Chrome's toolbar
   - Find "Jobnick" and click the pin icon

### Step 2: Configure Your Profile

1. Click the extension icon in your Chrome toolbar
2. Click "Settings" to open the full configuration panel
3. Go to the "Profile Setup" tab
4. Fill in your basic information:
   - Full Name
   - Email
   - Phone Number
   - Location
   - Resume/CV content
   - Default cover letter template
5. Click "Save Profile"

**Note**: You don't need to fill out the Job Preferences section to get started. The basic profile setup is sufficient for the main features.

### Step 3: Set Up AI Integration

1. Go to the "AI Agent" tab in settings
2. **Set up Gemini API Key**:
   - Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Enter the API key in the designated field
3. Click "Save AI Settings"

## 🎯 How to Use

### Fill Job Applications
1. Navigate to a LinkedIn job posting
2. Click the Jobnick extension icon
3. Click "Fill Job"
4. Choose your preferred mode:
   - **With Submission**: For automatic application submission
   - **Without Submission**: To review before sending (recommended)
5. The extension will automatically fill out the application form

### Message Recruiters
1. Go to a LinkedIn job posting
2. Click the Jobnick extension icon
3. Click "Message Recruiter"
4. Select your preferred language for the message
5. The extension will generate a personalized message
6. Review and send the message manually

### Request Referrals
1. Navigate to a company's LinkedIn page or job posting
2. Click the Jobnick extension icon
3. Click "Request Referral"
4. Select your preferred language for the referral request
5. The extension will help you identify connections and generate messages

## ⚙️ Configuration Options

### Language Settings
- **Message Language**: Choose the language for recruiter messages and referral requests
- **International Communication**: Support for multiple languages to reach global opportunities
- **Localized Content**: Messages are tailored to the selected language and culture

### AI Settings
- **API Configuration**: Manage your Gemini API access
- **Response Style**: Customize AI-generated content
- **Processing Speed**: Balance between speed and quality

### Profile Management
- **Auto-save**: Your profile data is automatically saved
- **Secure Storage**: Data is stored locally for privacy
- **Easy Updates**: Modify your profile anytime

## 🔮 Future Features

### AI Agent Mode (Coming Soon)
- **Automated Job Search**: AI agent will actively search for jobs matching your criteria
- **Smart Recommendations**: AI-powered job suggestions based on your profile
- **Automated Applications**: Full automation of the job application process
- **Intelligent Matching**: Advanced algorithms to find the best job opportunities

## 🚨 Safety and Ethics

### Important Considerations
- **Respect rate limits**: Don't overwhelm LinkedIn's servers
- **Review applications**: Always review applications before submission
- **Follow up**: Don't rely solely on automated tools
- **Compliance**: Follow LinkedIn's terms of service

### Legal Notice
This extension is for educational and personal use. Users are responsible for:
- Following LinkedIn's terms of service
- Ensuring applications are genuine and appropriate
- Complying with local employment laws
- Using the tool responsibly and ethically

## 🛠️ Technical Details

### Architecture
- **Manifest V3**: Uses the latest Chrome extension standards
- **Service Worker**: Background processing for automation
- **Content Scripts**: Page interaction and job analysis
- **AI Integration**: Gemini API integration for intelligent processing
- **Storage API**: Secure storage of profile and preferences

### Browser Compatibility
- **Chrome**: 88+ (Manifest V3 support)
- **Edge**: 88+ (Chromium-based)
- **Other Chromium browsers**: Should work with Manifest V3 support

## 📁 File Structure

```
jobnick/
├── manifest.json          # Extension configuration
├── popup.html            # Main popup interface
├── popup.css             # Popup styling
├── popup.js              # Advanced popup functionality
├── simple-popup.js       # Simplified popup logic
├── background.js         # Background service worker
├── content.js            # Content script for LinkedIn pages
├── ai_agent.js           # AI agent and automation logic
├── settings.js           # Settings and configuration management
├── settings.html         # Full settings interface
├── settings.css          # Settings styling
├── icons/                # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── agents/               # AI agent configurations
├── install.bat           # Windows installation script
├── README.md             # This file
└── ICON_GUIDE.md         # Icon creation guide
```

## 🆘 Support and Troubleshooting

### Common Issues
- **Extension not working**: Make sure you're on a LinkedIn job page
- **AI not responding**: Verify your Gemini API key is valid
- **Forms not filling**: Check that your profile is complete
- **Messages not generating**: Ensure you have a valid API key

### Getting Help
- Check the troubleshooting section above
- Review the console logs for error messages
- Ensure all files are properly loaded
- Verify Chrome extension permissions
- Check your Gemini API key and quota

## 📄 License

This project is provided as-is for educational purposes. Users are responsible for their own use and compliance with applicable terms of service and laws.

---

**Note**: This extension uses advanced AI technology to enhance your job search process. Always review applications and messages before sending, and ensure you're genuinely interested in the opportunities you're pursuing. The AI is designed to assist, not replace, your judgment in the job search process. 