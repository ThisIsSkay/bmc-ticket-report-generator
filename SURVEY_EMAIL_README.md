# Survey Email Branch Note

This branch is kept for reference only.

The Survey Email feature is not useful with the current BMC raw export because the exported ticket data does not expose the actual requester/customer email address.

The available fields may include customer names, submitter details, or email addresses mentioned inside free-text fields, but these are not a reliable source for the end user's email address and should not be used to build a survey recipient list.

Because of this, the Survey Email feature was removed from `main`.

If a future BMC export provides a dedicated requester/customer email field, this idea can be revisited.
