import chalk from 'chalk';

export class Spinner {
    private timer: NodeJS.Timeout | null = null;
    private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    private currentFrame = 0;
    private text: string;

    constructor(text: string = 'Thinking...') {
        this.text = text;
    }

    start(text?: string) {
        if (text) this.text = text;
        if (this.timer) return;

        this.currentFrame = 0;
        process.stdout.write('\x1B[?25l'); // Hide cursor

        this.timer = setInterval(() => {
            const frame = this.frames[this.currentFrame];
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;

            // Clear line and write spinner
            process.stdout.write(`\r${chalk.cyan(frame)} ${this.text}`);
        }, 80);
    }

    update(text: string) {
        this.text = text;
    }

    stop(finalText?: string, symbol: string = '✓') {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        process.stdout.write('\r\x1B[K'); // Clear line
        if (finalText) {
            console.log(`${chalk.green(symbol)} ${finalText}`);
        }
        process.stdout.write('\x1B[?25h'); // Show cursor
    }
}
