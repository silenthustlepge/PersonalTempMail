import json
import re

# Path to your emails.json file
EMAILS_JSON_PATH = r'C:\Users\prash\dump\TempMail\temp-mail-main\backend\emails.json'

# The correct alias prefix and domain
ALIAS_PREFIX = 'silenthustlep.ge+temp'
DOMAIN = '@gmail.com'



def is_valid_alias(address):
    """Check if the address matches the correct alias pattern."""
    pattern = re.compile(r'^silenthustlep\.ge\+temp\d+@gmail\.com$')
    return bool(pattern.match(address))

def main():
    # Try to load the current emails.json, but continue if it doesn't exist
    try:
        with open(EMAILS_JSON_PATH, 'r', encoding='utf-8') as f:
            emails = json.load(f)
    except FileNotFoundError:
        emails = []

    # Fix all addresses in the file to the correct format and reset is_used
    fixed_emails = []
    for idx, entry in enumerate(emails, 1):
        fixed_emails.append({
            'address': f'{ALIAS_PREFIX}{idx}{DOMAIN}',
            'is_used': False
        })

    # Save the fixed list back to emails.json
    with open(EMAILS_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(fixed_emails, f, indent=2)
    print(f'Fixed {EMAILS_JSON_PATH} with {len(fixed_emails)} valid aliases.')

if __name__ == '__main__':
    main()
