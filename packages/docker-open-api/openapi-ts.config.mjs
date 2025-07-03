export default {
    input: 'https://docs.docker.com/reference/api/engine/version/v1.51.yaml',
    output: 'src/sdk',
    plugins: [{
        name: '@hey-api/client-axios',
    }],
};
