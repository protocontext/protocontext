import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

export class ProtoContext implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ProtoContext',
		name: 'protoContext',
		icon: 'file:protocontext.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter["operation"] }}',
		description: 'Search and manage AI-readable content via ProtoContext',
		defaults: {
			name: 'ProtoContext',
		},
		inputs: ['main'],
		outputs: ['main'],
		usableAsTool: true,
		credentials: [
			{
				name: 'protoContextApi',
				required: true,
			},
		],
		properties: [
			// ------ Operation ------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Search',
						value: 'search',
						description: 'Search across all indexed content',
						action: 'Search across all indexed content',
					},
					{
						name: 'Get Site',
						value: 'getSite',
						description: 'Get all sections for a specific domain',
						action: 'Get all sections for a specific domain',
					},
					{
						name: 'Submit Domain',
						value: 'submit',
						description: 'Submit a domain for indexing',
						action: 'Submit a domain for indexing',
					},
					{
						name: 'Upload Content',
						value: 'upload',
						description: 'Upload raw context.txt content',
						action: 'Upload raw context txt content',
					},
					{
						name: 'Delete Domain',
						value: 'delete',
						description: 'Remove a domain from the index',
						action: 'Remove a domain from the index',
					},
					{
						name: 'Stats',
						value: 'stats',
						description: 'Get index statistics',
						action: 'Get index statistics',
					},
				],
				default: 'search',
			},

			// ------ Search ------
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { operation: ['search'] } },
				description: 'Search query — use 1-3 keywords for best results (e.g. "pricing", "opening hours", "menu")',
			},
			{
				displayName: 'Domain Filter',
				name: 'domain',
				type: 'string',
				default: '',
				displayOptions: { show: { operation: ['search'] } },
				description: 'Restrict search to a specific domain (e.g. "example.com")',
			},
			{
				displayName: 'Language',
				name: 'lang',
				type: 'string',
				default: '',
				displayOptions: { show: { operation: ['search'] } },
				description: 'Filter by language code (e.g. "en", "es")',
			},
			{
				displayName: 'Content Type',
				name: 'contentType',
				type: 'string',
				default: '',
				displayOptions: { show: { operation: ['search'] } },
				description: 'Filter by content type (e.g. "product", "hospitality", "restaurant")',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 10,
				displayOptions: { show: { operation: ['search'] } },
				description: 'Max number of results (1-100)',
				typeOptions: { minValue: 1, maxValue: 100 },
			},

			// ------ Get Site ------
			{
				displayName: 'Domain',
				name: 'siteDomain',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { operation: ['getSite'] } },
				description: 'Domain to retrieve (e.g. "example.com")',
			},

			// ------ Submit ------
			{
				displayName: 'Domain',
				name: 'submitDomain',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { operation: ['submit'] } },
				description: 'Domain to submit for indexing (e.g. "example.com")',
			},
			{
				displayName: 'AI Key',
				name: 'aiKey',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				displayOptions: { show: { operation: ['submit'] } },
				description: 'AI provider key (required if site has no context.txt)',
			},
			{
				displayName: 'AI Model',
				name: 'aiModel',
				type: 'string',
				default: '',
				placeholder: 'gemini/gemini-3-flash-preview',
				displayOptions: { show: { operation: ['submit'] } },
				description: 'AI model for content conversion (e.g. "gemini/gemini-3-flash-preview", "openai/gpt-4o-mini")',
			},

			// ------ Upload ------
			{
				displayName: 'Name',
				name: 'uploadName',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { operation: ['upload'] } },
				description: 'Identifier for the content (e.g. "my-company" or "product-catalog")',
			},
			{
				displayName: 'Content',
				name: 'uploadContent',
				type: 'string',
				typeOptions: { rows: 10 },
				default: '',
				required: true,
				displayOptions: { show: { operation: ['upload'] } },
				description: 'Raw context.txt content to upload',
			},

			// ------ Delete ------
			{
				displayName: 'Domain',
				name: 'deleteDomain',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { operation: ['delete'] } },
				description: 'Domain to remove from the index',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const results: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('protoContextApi');
		const baseUrl = (credentials.apiUrl as string).replace(/\/+$/, '');

		for (let i = 0; i < items.length; i++) {
			const operation = this.getNodeParameter('operation', i) as string;
			let response: any;

			try {
				if (operation === 'search') {
					const query = this.getNodeParameter('query', i) as string;
					const domain = this.getNodeParameter('domain', i, '') as string;
					const lang = this.getNodeParameter('lang', i, '') as string;
					const contentType = this.getNodeParameter('contentType', i, '') as string;
					const limit = this.getNodeParameter('limit', i, 10) as number;

					const qs: Record<string, string | number> = { q: query, limit };
					if (domain) qs.domain = domain;
					if (lang) qs.lang = lang;
					if (contentType) qs.content_type = contentType;

					response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'protoContextApi',
						{
							method: 'GET',
							url: `${baseUrl}/search`,
							qs,
							json: true,
						},
					);
				} else if (operation === 'getSite') {
					const domain = this.getNodeParameter('siteDomain', i) as string;
					response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'protoContextApi',
						{
							method: 'GET',
							url: `${baseUrl}/site`,
							qs: { domain },
							json: true,
						},
					);
				} else if (operation === 'submit') {
					const domain = this.getNodeParameter('submitDomain', i) as string;
					const aiKey = this.getNodeParameter('aiKey', i, '') as string;
					const aiModel = this.getNodeParameter('aiModel', i, '') as string;

					const body: Record<string, string> = { domain };
					if (aiKey) body.ai_key = aiKey;
					if (aiModel) body.ai_model = aiModel;

					response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'protoContextApi',
						{
							method: 'POST',
							url: `${baseUrl}/submit`,
							body,
							json: true,
						},
					);
				} else if (operation === 'upload') {
					const name = this.getNodeParameter('uploadName', i) as string;
					const content = this.getNodeParameter('uploadContent', i) as string;

					response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'protoContextApi',
						{
							method: 'POST',
							url: `${baseUrl}/upload`,
							body: { name, content },
							json: true,
						},
					);
				} else if (operation === 'delete') {
					const domain = this.getNodeParameter('deleteDomain', i) as string;
					response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'protoContextApi',
						{
							method: 'POST',
							url: `${baseUrl}/delete`,
							body: { domain },
							json: true,
						},
					);
				} else if (operation === 'stats') {
					response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'protoContextApi',
						{
							method: 'GET',
							url: `${baseUrl}/stats`,
							json: true,
						},
					);
				}

				results.push({ json: response });
			} catch (error: any) {
				if (this.continueOnFail()) {
					results.push({
						json: { error: error.message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [results];
	}
}
