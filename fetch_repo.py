import os
import subprocess
import requests

def get_github_access_token():
    """Get GitHub access token from Replit connector."""
    hostname = os.environ.get('REPLIT_CONNECTORS_HOSTNAME')
    repl_identity = os.environ.get('REPL_IDENTITY')
    web_repl_renewal = os.environ.get('WEB_REPL_RENEWAL')
    
    if repl_identity:
        x_replit_token = f'repl {repl_identity}'
    elif web_repl_renewal:
        x_replit_token = f'depl {web_repl_renewal}'
    else:
        raise Exception('X_REPLIT_TOKEN not found')
    
    response = requests.get(
        f'https://{hostname}/api/v2/connection?include_secrets=true&connector_names=github',
        headers={
            'Accept': 'application/json',
            'X_REPLIT_TOKEN': x_replit_token
        }
    )
    
    data = response.json()
    connection = data.get('items', [{}])[0]
    settings = connection.get('settings', {})
    
    access_token = settings.get('access_token') or settings.get('oauth', {}).get('credentials', {}).get('access_token')
    
    if not access_token:
        raise Exception('GitHub not connected or no access token found')
    
    return access_token

def clone_repository(token, repo_url, dest_dir='ws-trader-pulse'):
    """Clone a GitHub repository using the access token."""
    # Extract owner/repo from URL
    # https://github.com/whizzler-rizzler/ws-trader-pulse
    parts = repo_url.rstrip('/').split('/')
    owner = parts[-2]
    repo = parts[-1]
    
    # Clone using token in URL
    auth_url = f'https://{token}@github.com/{owner}/{repo}.git'
    
    result = subprocess.run(
        ['git', 'clone', auth_url, dest_dir],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"Error: {result.stderr}")
        return False
    
    print(f"Successfully cloned to {dest_dir}")
    return True

if __name__ == '__main__':
    print("Fetching GitHub access token...")
    token = get_github_access_token()
    print("Token obtained successfully!")
    
    print("Cloning repository...")
    repo_url = 'https://github.com/whizzler-rizzler/ws-trader-pulse'
    success = clone_repository(token, repo_url)
    
    if success:
        print("Repository cloned successfully!")
    else:
        print("Failed to clone repository")
