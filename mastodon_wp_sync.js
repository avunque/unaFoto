const axios = require('axios');
const fs = require('fs');

// Configurations
const MASTODON_API = 'https://mastodon.instance/api/v1'; // Change to your Mastodon instance
const MASTODON_TOKEN = 'YOUR_MASTODON_ACCESS_TOKEN';
const WORDPRESS_API = 'https://your-wordpress-site.com/wp-json/wp/v2/pages';
const WORDPRESS_USER = 'your_username';
const WORDPRESS_PASSWORD = 'your_application_password';
const HASHTAG = '1fotocmu260';
const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
const TRACKED_POSTS_FILE = 'tracked_posts.json';

// Load or initialize tracked posts
let trackedPosts = fs.existsSync(TRACKED_POSTS_FILE) ? JSON.parse(fs.readFileSync(TRACKED_POSTS_FILE)) : {};

// Encode WordPress credentials
const wpAuth = Buffer.from(`${WORDPRESS_USER}:${WORDPRESS_PASSWORD}`).toString('base64');

async function fetchMastodonPosts() {
    try {
        const response = await axios.get(`${MASTODON_API}/timelines/tag/${HASHTAG}`, {
            headers: { 'Authorization': `Bearer ${MASTODON_TOKEN}` }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching Mastodon posts:', error.response?.data || error.message);
        return [];
    }
}

async function fetchReplies(postId) {
    try {
        const response = await axios.get(`${MASTODON_API}/statuses/${postId}/context`, {
            headers: { 'Authorization': `Bearer ${MASTODON_TOKEN}` }
        });
        return response.data.descendants;
    } catch (error) {
        console.error(`Error fetching replies for post ${postId}:`, error.response?.data || error.message);
        return [];
    }
}

async function createWordPressPage(title, content) {
    try {
        const response = await axios.post(WORDPRESS_API, {
            title, content, status: 'publish'
        }, {
            headers: { 'Authorization': `Basic ${wpAuth}`, 'Content-Type': 'application/json' }
        });
        return response.data.id;
    } catch (error) {
        console.error('Error creating WordPress page:', error.response?.data || error.message);
        return null;
    }
}

async function updateWordPressPage(pageId, newContent) {
    try {
        await axios.post(`${WORDPRESS_API}/${pageId}`, { content: newContent }, {
            headers: { 'Authorization': `Basic ${wpAuth}`, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error(`Error updating WordPress page ${pageId}:`, error.response?.data || error.message);
    }
}

async function processMastodonPosts() {
    console.log('Checking for new Mastodon posts...');
    const posts = await fetchMastodonPosts();
    for (const post of posts) {
        if (!trackedPosts[post.id]) {
            console.log(`New post found: ${post.content}`);
            const pageId = await createWordPressPage(`Mastodon Post ${post.id}`, post.content);
            if (pageId) trackedPosts[post.id] = { pageId, replies: [] };
        }
    }
    fs.writeFileSync(TRACKED_POSTS_FILE, JSON.stringify(trackedPosts, null, 2));
}

async function updateReplies() {
    console.log('Checking for replies to tracked posts...');
    for (const postId of Object.keys(trackedPosts)) {
        const postData = trackedPosts[postId];
        const replies = await fetchReplies(postId);
        const newReplies = replies.filter(reply => !postData.replies.includes(reply.id));
        if (newReplies.length) {
            console.log(`Updating post ${postId} with ${newReplies.length} new replies.`);
            postData.replies.push(...newReplies.map(reply => reply.id));
            const replyContent = newReplies.map(reply => `<p>${reply.content}</p>`).join('\n');
            await updateWordPressPage(postData.pageId, replyContent);
        }
    }
    fs.writeFileSync(TRACKED_POSTS_FILE, JSON.stringify(trackedPosts, null, 2));
}

async function main() {
    while (true) {
        await processMastodonPosts();
        await updateReplies();
        console.log('Sleeping...');
        await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
    }
}

main().catch(console.error);
