import type {
	IAuthenticateGeneric,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ProtoContextApi implements ICredentialType {
	name = 'protoContextApi';
	displayName = 'ProtoContext API';
	documentationUrl = 'https://github.com/protocontext/protocontext';
	properties: INodeProperties[] = [
		{
			displayName: 'API URL',
			name: 'apiUrl',
			type: 'string',
			default: 'http://localhost',
			placeholder: 'https://protocolcontext.com',
			description: 'The base URL of your ProtoContext instance (no trailing slash)',
			required: true,
		},
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'Your ProtoContext API token (session token or API key)',
			required: true,
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-Proto-Token': '={{$credentials.apiToken}}',
			},
		},
	};
}
