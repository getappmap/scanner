import { join } from 'path';
import sinon from 'sinon';
import AssertCommand from '../src/command';

describe('smoke test', () => {
  afterAll(() => {
    sinon.restore();
  });

  it('runs as expected', async () => {
    const processExit = sinon.stub(process, 'exit');
    await AssertCommand.handler({
      appmapDir: join(__dirname, 'fixtures', 'appmaps'),
      config: join(__dirname, '..', 'src', 'defaultAssertions'),
      format: 'progress',
    } as any);

    expect(processExit.calledWith(0)).toBe(true);
  });
});
